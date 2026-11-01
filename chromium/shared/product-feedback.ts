export const PRODUCT_FEEDBACK_ACKNOWLEDGEMENT_TEXT =
  "I understand this form is only for product feedback. I will not include passwords, API keys, payment details, sensitive personal information, illegal content, or any other non-compliant information. I understand messages containing non-compliant information may be deleted immediately.";

export const PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH = 5_000;
export const PRODUCT_FEEDBACK_CURRENT_PAGE_URL_MAX_LENGTH = 2_048;
export const PRODUCT_FEEDBACK_USER_AGENT_MAX_LENGTH = 512;

export const PRODUCT_FEEDBACK_TRIAGE_TYPES = [
  "feature_request",
  "bug_report",
  "general_feedback",
] as const;

export type ProductFeedbackTriageType =
  (typeof PRODUCT_FEEDBACK_TRIAGE_TYPES)[number];

const PRODUCT_FEEDBACK_TRIAGE_LABELS: Record<
  ProductFeedbackTriageType,
  string
> = {
  feature_request: "Feature request",
  bug_report: "Bug report",
  general_feedback: "General feedback",
};

export const PRODUCT_FEEDBACK_TRIAGE_OPTIONS = Object.freeze(
  PRODUCT_FEEDBACK_TRIAGE_TYPES.map((value) => ({
    value,
    label: PRODUCT_FEEDBACK_TRIAGE_LABELS[value],
  })),
);

export function getProductFeedbackTriageLabel(
  triageType: ProductFeedbackTriageType,
): string {
  return PRODUCT_FEEDBACK_TRIAGE_LABELS[triageType];
}

export function isProductFeedbackTriageType(
  value: string,
): value is ProductFeedbackTriageType {
  return PRODUCT_FEEDBACK_TRIAGE_TYPES.some(
    (triageType) => triageType === value,
  );
}
