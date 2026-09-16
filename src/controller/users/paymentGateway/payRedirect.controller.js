import {
  handlePayRedirect,
  payRedirectErrorPage,
} from "../../../services/users/payment/payRedirect.service.js";

export const payRedirect = async (req, res, next) => {
  try {
    const result = await handlePayRedirect(req.params.orderId);

    if (result.type === "redirect") {
      return res.redirect(result.status, result.location);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(result.status).send(result.body);
  } catch (error) {
    if (error.status) {
      const page = payRedirectErrorPage(
        error.status,
        error.message || "Something went wrong",
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(page.status).send(page.body);
    }
    return next(error);
  }
};
