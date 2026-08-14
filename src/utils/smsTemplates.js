/**
 * DLT-approved SpringEdge SMS templates.
 * Template IDs are for internal mapping only — never sent on the HTTP request.
 * Final `message` must match registered DLT text after replacing {#var#} only.
 */

export const SMS_TEMPLATE_KEYS = {
  OTP_CREATE_ACCOUNT: "OTP_CREATE_ACCOUNT",
  OTP_DELIVERY: "OTP_DELIVERY",
  DELIVERY_SUCCESS: "DELIVERY_SUCCESS",
  ORDER_RECEIVED: "ORDER_RECEIVED",
  OTP_PICKUP: "OTP_PICKUP",
};

export const SMS_TEMPLATES = {
  OTP_CREATE_ACCOUNT: {
    template_id: "1077120910001204018",
    text: "Your OTP for creating your MetroGini account is {#var#} Valid for 10 minutes. Do not share this code with anyone.",
    variables: ["otp"],
  },
  OTP_DELIVERY: {
    template_id: "1077568550002243080",
    text: "Your freshly washed and ironed clothes are at your doorstep! Please share OTP {#var#} with the rider to confirm delivery. MetroGini (Wash by Kilo)",
    variables: ["otp"],
  },
  DELIVERY_SUCCESS: {
    template_id: "107713000002988489",
    text: "Thankyou for choosing MetroGini! Your freshly washed and ironed clothes have been successfully delivered. We'd love your feedback on Playstore or Appstore",
    variables: [],
  },
  ORDER_RECEIVED: {
    template_id: "107717518000307384",
    text: "We've received your order! Track your order status on the MetroGini App or check WhatsApp for further updates.",
    variables: [],
  },
  OTP_PICKUP: {
    template_id: "107728990003028494",
    text: "Our rider has arrived for your laundry pickup! Please share OTP {#var#} with the rider to verify your pickup. MetroGini (Wash by Kilo)",
    variables: ["otp"],
  },
};

/**
 * Build final SMS body from DLT template. Only replaces {#var#}.
 * @returns {{ templateKey: string, templateId: string, message: string }}
 */
export const buildSmsMessage = (templateKey, variables = {}) => {
  const template = SMS_TEMPLATES[templateKey];
  if (!template) {
    throw {
      status: 400,
      code: "invalid_template",
      message: `Unknown SMS template key: ${templateKey}`,
    };
  }

  let message = template.text;

  if (template.variables.includes("otp")) {
    const otp = variables.otp != null ? String(variables.otp).trim() : "";
    if (!otp) {
      throw {
        status: 400,
        code: "invalid_template_match",
        message: `OTP is required for template ${templateKey}`,
      };
    }
    message = template.text.replace("{#var#}", otp);
  }

  if (message.includes("{#var#}")) {
    throw {
      status: 400,
      code: "invalid_template_match",
      message: `Unresolved placeholder in template ${templateKey}`,
    };
  }

  // Exact DLT match: rebuild expected from registered text only
  const expected =
    template.variables.length === 0
      ? template.text
      : template.text.replace("{#var#}", String(variables.otp).trim());

  if (message !== expected) {
    throw {
      status: 400,
      code: "invalid_template_match",
      message: `Final SMS does not match DLT template ${template.template_id}`,
    };
  }

  return {
    templateKey,
    templateId: template.template_id,
    message,
  };
};
