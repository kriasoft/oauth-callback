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
  //Stack Trace
  test("should have a stack trace", () => {
    const error = new OAuthError("unauthorized_client");
    expect(typeof error.stack).toBe("string");
    expect(error.stack!.includes("OAuthError")).toBe(true);
    expect(error.stack!.includes(error.message)).toBe(true);
  });
});
//Test the TIMEOUT ERROR
describe("TimeoutError", () => {
  // Test for TimeoutError's name
  test("should have the correct name property", () => {
    const error = new TimeoutError();
    expect(error.name).toBe("TimeoutError");
  });
  //TimeoutError's default message
  test("should use the default timeout message", () => {
    const error = new TimeoutError(); // No custom message provided
    expect(error.message).toBe("OAuth callback timed out");
  });
  //Test with a custom message
  test("should use a custom message if provided", () => {
    const error = new TimeoutError("It took too long, please try again.");
    expect(error.message).toBe("It took too long, please try again.");
  });
  //Stack Trace
  test("should have a stack trace", () => {
    const error = new OAuthError("unauthorized_client");
    expect(typeof error.stack).toBe("string");
    expect(error.stack!.includes("OAuthError")).toBe(true);
    expect(error.stack!.includes(error.message)).toBe(true);
  });
  test("should have a stack trace", () => {
    const error = new TimeoutError("unauthorized_client");
    expect(typeof error.stack).toBe("string");
    expect(error.stack!.includes("TimeoutError")).toBe(true);
    expect(error.stack!.includes(error.message)).toBe(true);
  });
});
