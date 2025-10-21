import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RestApiStack } from "../lib/rest-api-stack";

const app = new cdk.App();

const envName = app.node.tryGetContext("env") ?? "dev";
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? "us-east-1";

new RestApiStack(app, `LambdaRestApi-${envName}`, {
  env: { account, region },
  stackName: `lambda-rest-api-${envName}`,
});
