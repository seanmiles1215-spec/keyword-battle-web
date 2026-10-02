export const DEFAULT_TARGET_ACOS = "0.35";

export interface ConfirmationParameters {
  periodStart: string;
  periodEnd: string;
  reportType: string;
  attributionDays: string;
  attributionMetricGroup: string;
  targetAcos: string;
}

export interface ParameterRequest {
  readonly revision: number;
  readonly parameters: Readonly<ConfirmationParameters>;
}

const PARAMETER_KEYS = [
  "periodStart",
  "periodEnd",
  "reportType",
  "attributionDays",
  "attributionMetricGroup",
  "targetAcos",
] as const satisfies readonly (keyof ConfirmationParameters)[];

export function createParameterRequest(
  parameters: ConfirmationParameters,
  revision: number,
): ParameterRequest {
  return Object.freeze({
    revision,
    parameters: Object.freeze({ ...parameters }),
  });
}

export function acceptsParameterResponse(
  request: ParameterRequest,
  currentRevision: number,
  currentParameters: ConfirmationParameters,
) {
  return request.revision === currentRevision
    && PARAMETER_KEYS.every((key) => request.parameters[key] === currentParameters[key]);
}
