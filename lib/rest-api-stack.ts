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

export class RestApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const fn = new lambda.Function(this, "ApiHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler.main",
      code: lambda.Code.fromAsset("dist-lambda"),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

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
    api.root.addMethod("ANY", integration);
    api.root.addResource("{proxy+}").addMethod("ANY", integration);

    new CfnOutput(this, "ApiUrl", { value: api.url });
  }
}
