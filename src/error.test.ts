import { expect, test, describe } from "bun:test";
import { OAuthError, TimeoutError } from "./errors";

describe("OAuthError", () => {
  describe("constructor", () => {
    test("sets all properties correctly", () => {
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

    test("uses error code as message when description is not provided", () => {
      const error = new OAuthError("server_error");
      expect(error.message).toBe("server_error");
      expect(error.error_description).toBeUndefined();
    });

    test("sets optional parameters correctly", () => {
      const error1 = new OAuthError("invalid_request", "Bad request");
      expect(error1.error_description).toBe("Bad request");
      expect(error1.error_uri).toBeUndefined();

      const error2 = new OAuthError("invalid_request");
      expect(error2.error_description).toBeUndefined();
      expect(error2.error_uri).toBeUndefined();
    });
  });

  describe("inheritance", () => {
    test("extends native Error class", () => {
      const error = new OAuthError("invalid_request");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof OAuthError).toBe(true);
    });

    test("has correct name property", () => {
      const error = new OAuthError("any_error");
      expect(error.name).toBe("OAuthError");
    });

    test("maintains proper stack trace", () => {
      const error = new OAuthError("unauthorized_client");
      expect(typeof error.stack).toBe("string");
      expect(error.stack!.includes("OAuthError")).toBe(true);
      expect(error.stack!.includes(error.message)).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("handles empty string parameters", () => {
      const error = new OAuthError("", "", "");
      expect(error.error).toBe("");
      expect(error.message).toBe("");
      expect(error.error_description).toBe("");
      expect(error.error_uri).toBe("");
    });

    test("handles very long strings", () => {
      const longString = "x".repeat(10000);
      const error = new OAuthError(longString, longString, longString);
      expect(error.error).toBe(longString);
      expect(error.error_description).toBe(longString);
      expect(error.error_uri).toBe(longString);
      expect(error.message).toBe(longString);
    });

    test("handles special characters and unicode", () => {
      const special = "错误 🚨 <script>alert('xss')</script>";
      const error = new OAuthError(special, special, special);
      expect(error.error).toBe(special);
      expect(error.error_description).toBe(special);
      expect(error.error_uri).toBe(special);
    });
  });

  describe("serialization", () => {
    test("JSON.stringify includes custom properties and name", () => {
      const error = new OAuthError(
        "access_denied",
        "User denied access",
        "https://example.com/error",
      );
      const json = JSON.stringify(error);
      const parsed = JSON.parse(json);

      expect(parsed.error).toBe("access_denied");
      expect(parsed.error_description).toBe("User denied access");
      expect(parsed.error_uri).toBe("https://example.com/error");
      expect(parsed.name).toBe("OAuthError");
      expect(parsed.message).toBeUndefined();
      expect(parsed.stack).toBeUndefined();
    });

    test("JSON.stringify with minimal properties", () => {
      const error = new OAuthError("invalid_grant");
      const json = JSON.stringify(error);
      const parsed = JSON.parse(json);

      expect(parsed.error).toBe("invalid_grant");
      expect(parsed.error_description).toBeUndefined();
      expect(parsed.error_uri).toBeUndefined();
      expect(parsed.name).toBe("OAuthError");
    });
  });

  describe("comparison", () => {
    test("two errors with same properties are not equal by reference", () => {
      const e1 = new OAuthError("same", "desc", "uri");
      const e2 = new OAuthError("same", "desc", "uri");
      expect(e1 === e2).toBe(false);
      expect(e1).not.toBe(e2);
    });

    test("errors have different stack traces even with same properties", () => {
      const e1 = new OAuthError("same");
      const e2 = new OAuthError("same");
      expect(e1.stack).not.toBe(e2.stack);
    });
  });
});

describe("TimeoutError", () => {
  describe("constructor", () => {
    test("has correct name property", () => {
      const error = new TimeoutError();
      expect(error.name).toBe("TimeoutError");
    });

    test("uses default message when not provided", () => {
      const error = new TimeoutError();
      expect(error.message).toBe("OAuth callback timed out");
    });

    test("uses custom message when provided", () => {
      const error = new TimeoutError("It took too long, please try again.");
      expect(error.message).toBe("It took too long, please try again.");
    });
  });

  describe("inheritance", () => {
    test("extends native Error class", () => {
      const error = new TimeoutError();
      expect(error instanceof Error).toBe(true);
      expect(error instanceof TimeoutError).toBe(true);
    });

    test("maintains proper stack trace", () => {
      const error = new TimeoutError("Custom timeout message");
      expect(typeof error.stack).toBe("string");
      expect(error.stack!.includes("TimeoutError")).toBe(true);
      expect(error.stack!.includes(error.message)).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("handles empty string message", () => {
      const error = new TimeoutError("");
      expect(error.message).toBe("");
    });

    test("handles very long message", () => {
      const longMessage = "Timeout: " + "x".repeat(10000);
      const error = new TimeoutError(longMessage);
      expect(error.message).toBe(longMessage);
    });
  });

  describe("serialization", () => {
    test("JSON.stringify only includes name property", () => {
      const error = new TimeoutError("Custom message");
      const json = JSON.stringify(error);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual({ name: "TimeoutError" });
      expect(parsed.message).toBeUndefined();
      expect(parsed.stack).toBeUndefined();
    });
  });

  describe("comparison", () => {
    test("two errors with same message are not equal by reference", () => {
      const e1 = new TimeoutError("Same message");
      const e2 = new TimeoutError("Same message");
      expect(e1 === e2).toBe(false);
      expect(e1).not.toBe(e2);
    });

    test("errors have different stack traces even with same message", () => {
      const e1 = new TimeoutError();
      const e2 = new TimeoutError();
      expect(e1.stack).not.toBe(e2.stack);
    });
  });
});
