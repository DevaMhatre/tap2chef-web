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
