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

    // --- Lambda Function ---
    const fn = new lambda.Function(this, "ApiHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler.main",
      code: lambda.Code.fromAsset("dist-lambda"),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: { NODE_OPTIONS: "--enable-source-maps" },
    });

    // --- Access Logs ---
    const accessLogs = new logs.LogGroup(this, "ApiAccessLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- API Gateway REST API ---
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

    // --- Cognito Authorizer ---
    const userPoolId = "us-east-1_C2ij1z29M";
    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      "ExistingUserPool",
      userPoolId
    );

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuth",
      {
        authorizerName: "CognitoAuthorizer",
        cognitoUserPools: [userPool],
      }
    );

    // --- Public Routes (/auth/*) ---
    const auth = api.root.addResource("auth");

    const signup = auth.addResource("signup");
    signup.addMethod("POST", integration, {
      authorizationType: apigw.AuthorizationType.NONE,
    });

    const verify = auth.addResource("verify");
    verify.addMethod("POST", integration, {
      authorizationType: apigw.AuthorizationType.NONE,
    });

    const login = auth.addResource("login");
    login.addMethod("POST", integration, {
      authorizationType: apigw.AuthorizationType.NONE,
    });

    const refresh = auth.addResource("refresh");
    refresh.addMethod("POST", integration, {
      authorizationType: apigw.AuthorizationType.NONE,
    });

    const changePassword = auth.addResource("change-password");
    changePassword.addMethod("POST", integration, {
      authorizationType: apigw.AuthorizationType.NONE,
    });

    const logout = auth.addResource("logout");
    logout.addMethod("POST", integration, {
      authorizationType: apigw.AuthorizationType.NONE,
    });

    // --- Protected routes (default proxy) ---
    api.root.addMethod("ANY", integration, {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });

    const proxy = api.root.addResource("{proxy+}");
    proxy.addMethod("ANY", integration, {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });

    new CfnOutput(this, "ApiUrl", { value: api.url });
  }
}
