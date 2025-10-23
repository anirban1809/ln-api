import {
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ChangePasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cip, CLIENT_ID, Res } from "./handler";
import { corsHeaders, json, cookieHeader, extractCookie } from "./util";

export async function handleSignup(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const body = JSON.parse(event.body || "{}");
  const { email, password, firstName, lastName } = body;
  if (!email || !password)
    return json(400, { error: "Missing email or password" }, headers);

  try {
    await cip.send(
      new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "given_name", Value: firstName || "" },
          { Name: "family_name", Value: lastName || "" },
        ],
      })
    );
    return json(
      200,
      { ok: true, message: "Signup successful. Please verify email." },
      headers
    );
  } catch (e: any) {
    return json(400, { error: e.message || "Signup failed" }, headers);
  }
}

export async function handleVerify(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const body = JSON.parse(event.body || "{}");
  const { email, code } = body;
  if (!email || !code)
    return json(400, { error: "Missing email or code" }, headers);

  try {
    await cip.send(
      new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      })
    );
    return json(
      200,
      { ok: true, message: "Email verified successfully." },
      headers
    );
  } catch (e: any) {
    return json(400, { error: e.message || "Verification failed" }, headers);
  }
}

export async function handleLogin(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const body = JSON.parse(event.body || "{}");
  const { email, password } = body;
  if (!email || !password)
    return json(400, { error: "Missing credentials" }, headers);

  try {
    const resp = await cip.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: CLIENT_ID,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      })
    );
    const auth = resp.AuthenticationResult;
    if (!auth?.AccessToken || !auth?.RefreshToken)
      return json(401, { error: "Invalid login" }, headers);

    const setCookie = cookieHeader("rt", encodeURIComponent(auth.RefreshToken));
    return {
      statusCode: 200,
      headers: { ...headers, "Set-Cookie": setCookie },
      body: JSON.stringify({
        accessToken: auth.AccessToken,
        expiresIn: auth.ExpiresIn,
        idToken: auth.IdToken,
      }),
    };
  } catch (e: any) {
    return json(401, { error: e.message || "Login failed" }, headers);
  }
}

export async function handleRefresh(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie;
  const rt = extractCookie(cookieHeader);
  if (!rt) return json(401, { error: "Missing refresh token" }, headers);

  try {
    const resp = await cip.send(
      new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: rt },
      })
    );
    const auth = resp.AuthenticationResult;
    if (!auth?.AccessToken)
      return json(401, { error: "Invalid refresh" }, headers);

    const newRt = auth.RefreshToken || rt;
    const setCookie = cookieHeader("rt", encodeURIComponent(newRt));
    return {
      statusCode: 200,
      headers: { ...headers, "Set-Cookie": setCookie },
      body: JSON.stringify({
        accessToken: auth.AccessToken,
        expiresIn: auth.ExpiresIn,
        idToken: auth.IdToken,
      }),
    };
  } catch (e: any) {
    return json(
      401,
      { error: e.message || "Failed to refresh token" },
      headers
    );
  }
}

export async function handleChangePassword(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const body = JSON.parse(event.body || "{}");
  const { accessToken, previousPassword, proposedPassword } = body;
  if (!accessToken || !previousPassword || !proposedPassword)
    return json(400, { error: "Missing fields" }, headers);

  try {
    await cip.send(
      new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: previousPassword,
        ProposedPassword: proposedPassword,
      })
    );
    return json(
      200,
      { ok: true, message: "Password changed successfully." },
      headers
    );
  } catch (e: any) {
    return json(
      400,
      { error: e.message || "Failed to change password" },
      headers
    );
  }
}

export async function handleLogout(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const clear = cookieHeader("rt", "", { maxAge: 0 });
  return {
    statusCode: 204,
    headers: { ...headers, "Set-Cookie": clear },
    body: "",
  };
}
