const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.error.issues.map((issue) => issue.message).join(", "),
    });
  }

  req.body = result.data;
  next();
};

export default validate;

export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.error.issues.map((issue) => issue.message).join(", "),
    });
  }

  // Express 5 makes req.query a getter, so the parsed values replace it this way.
  Object.defineProperty(req, "query", { value: result.data });
  next();
};
