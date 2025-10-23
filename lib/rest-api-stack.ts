import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class RestApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- Lambda ---
    const fn = new lambda.Function(this, "ApiHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler.main",
      code: lambda.Code.fromAsset("dist-lambda"),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: { NODE_OPTIONS: "--enable-source-maps" },
    });

    // --- Logs + API ---
    const accessLogs = new logs.LogGroup(this, "ApiAccessLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const api = new apigw.RestApi(this, "RestApi", {
      restApiName: "lambda-rest-api",
      deployOptions: {
        stageName: "v1",
        accessLogDestination: new apigw.LogGroupLogDestination(accessLogs),
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields(),
      },
      defaultCorsPreflightOptions: {
        allowHeaders: apigw.Cors.DEFAULT_HEADERS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowOrigins: apigw.Cors.ALL_ORIGINS,
      },
    });

    const integration = new apigw.LambdaIntegration(fn, { proxy: true });

    // ===== Import existing User Pool (pick one of the two ways) =====

    // Option 1: pass the User Pool ID via context or env
    // e.g. cdk deploy ... --context userPoolId=ap-south-1_AbCdEf123
    const userPoolId = "us-east-1_C2ij1z29M";
    // if (!userPoolId) {
    //   throw new Error(
    //     "Missing userPoolId. Provide --context userPoolId=<POOL_ID> or set USER_POOL_ID."
    //   );
    // }
    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      "ExistingUserPool",
      userPoolId
    );

    // Option 2: if you prefer ARN (comment out Option 1 and use this)
    // const userPool = cognito.UserPool.fromUserPoolArn(
    //   this,
    //   "ExistingUserPool",
    //   "arn:aws:cognito-idp:<region>:<account>:userpool/<POOL_ID>"
    // );

    // Create a Cognito User Pools Authorizer referencing the existing pool
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuth",
      {
        authorizerName: "CognitoAuthorizer",
        cognitoUserPools: [userPool],
      }
    );

    // Protect root and proxy with Cognito
    api.root.addMethod("ANY", integration, {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
      // authorizationScopes: ["api/read"] // only if you use resource-server scopes
    });

    const proxy = api.root.addResource("{proxy+}");
    proxy.addMethod("ANY", integration, {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });

    // OPTIONAL: unauthenticated public path
    const pub = api.root.addResource("public");
    pub.addMethod("ANY", integration, {
      authorizationType: apigw.AuthorizationType.NONE,
    });

    new CfnOutput(this, "ApiUrl", { value: api.url });
  }
}
