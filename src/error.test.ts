import { expect, test, describe } from "bun:test";
import { OAuthError, TimeoutError } from "./errors";
describe("OAuthError", () => {
  //Constructor sets properties
  test("sets properties from constructor", () => {
    const e = new OAuthError(
      "access_denied",
      "User denied access",
      "https://ex.com/e",
    );
    expect(e).toBeInstanceOf(OAuthError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("OAuthError");
    expect(e.error).toBe("access_denied");
    expect(e.error_description).toBe("User denied access");
    expect(e.error_uri).toBe("https://ex.com/e");
    expect(typeof e.stack).toBe("string");
    expect(e.stack!.startsWith("OAuthError")).toBeTrue();
  });
  //Error inheritance from native Error class
  test("should be an instance of the native Error class", () => {
    const error = new OAuthError("invalid_request");
    expect(error instanceof Error).toBe(true);
  });
});
