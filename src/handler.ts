import { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from "aws-lambda";

export async function main(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2
): Promise<any> {
  return {
    statusCode: 200,
    body: {
      message: "success",
    },
  };
}
