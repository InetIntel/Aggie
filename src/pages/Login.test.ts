import { expect, test } from "@jest/globals";
import { loginRedirectPath } from "./Login";

test.each([
  ["https://dev.example.com", null, "/alerts"],
  ["https://prod.example.com/aggie", null, "/aggie/alerts"],
  [
    "https://prod.example.com/aggie/",
    "/incidents?x=1",
    "/aggie/incidents?x=1",
  ],
  [undefined, "incidents", "/incidents"],
  ["https://dev.example.com", "//google.com", "/google.com"],
])("loginRedirectPath(%s, %s) is %s", (publicUrl, to, expected) => {
  expect(loginRedirectPath(publicUrl, to)).toBe(expected);
});
