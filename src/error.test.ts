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
  //Default message
  test("should use error code as message if description is not provided", () => {
    // Create an error without a description
    const error = new OAuthError("server_error");
    expect(error.message).toBe("server_error");
  });
  //Error name is set correctly
  test("should have the correct name property", () => {
    const error = new OAuthError("any_error");
    // Check the .name property is set to "OAuthError"
    expect(error.name).toBe("OAuthError");
  });
  //Test the TIMEOUT ERROR
});
