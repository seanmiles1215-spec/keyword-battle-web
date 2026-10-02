import { describe, expect, it } from "vitest";

import {
  acceptsParameterResponse,
  createParameterRequest,
  DEFAULT_TARGET_ACOS,
  type ConfirmationParameters,
} from "../src/new-report/parameter-lock";

const parameters: ConfirmationParameters = {
  periodStart: "2026-08-01",
  periodEnd: "2026-08-14",
  reportType: "Sponsored Products Search Term",
  attributionDays: "14",
  attributionMetricGroup: "sp-sales-orders-14d",
  targetAcos: "0.35",
};

describe("parameter lock revision", () => {
  it("accepts a hash only for the unchanged immutable request snapshot", () => {
    const request = createParameterRequest(parameters, 4);

    expect(DEFAULT_TARGET_ACOS).toBe("0.35");
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.parameters)).toBe(true);
    expect(acceptsParameterResponse(request, 4, parameters)).toBe(true);
    expect(acceptsParameterResponse(request, 5, parameters)).toBe(false);
    expect(acceptsParameterResponse(request, 4, {
      ...parameters,
      targetAcos: "0.40",
    })).toBe(false);
  });
});
