import { describe, expect, it } from "vitest";
import { planDevBrowserRepair } from "./dev-browser";

describe("planDevBrowserRepair", () => {
  it("is a no-op with no clerk cookies (production / fresh profile)", () => {
    expect(planDevBrowserRepair([])).toBeNull();
    expect(
      planDevBrowserRepair([{ name: "__client_uat", value: "0" }]),
    ).toBeNull();
  });

  it("validates even a unanimous bare cookie so dead values can be removed", () => {
    expect(
      planDevBrowserRepair([
        { name: "__clerk_db_jwt", value: "dvb_a" },
        { name: "__clerk_db_jwt_CEzw5HzA", value: "dvb_a" },
      ]),
    ).toEqual({ bare: "dvb_a", values: ["dvb_a"] });
  });

  it("validates a single bare cookie before Clerk reads it", () => {
    expect(
      planDevBrowserRepair([{ name: "__clerk_db_jwt", value: "dvb_only" }]),
    ).toEqual({ bare: "dvb_only", values: ["dvb_only"] });
  });

  it("orders the bare cookie's value first, deduped", () => {
    expect(
      planDevBrowserRepair([
        { name: "__clerk_db_jwt_CEzw5HzA", value: "dvb_new" },
        { name: "__clerk_db_jwt", value: "dvb_old" },
        { name: "__clerk_db_jwt_other", value: "dvb_new" },
      ]),
    ).toEqual({ bare: "dvb_old", values: ["dvb_old", "dvb_new"] });
  });

  it("handles a missing bare cookie with divergent suffixed ones", () => {
    expect(
      planDevBrowserRepair([
        { name: "__clerk_db_jwt_a", value: "dvb_1" },
        { name: "__clerk_db_jwt_b", value: "dvb_2" },
      ]),
    ).toEqual({ bare: undefined, values: ["dvb_1", "dvb_2"] });
  });

  it("repairs a missing bare cookie even from a single suffixed value", () => {
    expect(
      planDevBrowserRepair([{ name: "__clerk_db_jwt_a", value: "dvb_only" }]),
    ).toEqual({ bare: undefined, values: ["dvb_only"] });
  });

  it("treats an empty-string bare cookie as missing", () => {
    expect(
      planDevBrowserRepair([
        { name: "__clerk_db_jwt", value: "" },
        { name: "__clerk_db_jwt_a", value: "dvb_real" },
      ]),
    ).toEqual({ bare: undefined, values: ["dvb_real"] });
  });
});
