const createResponse = (statusCode, data, message) => {
  const response = {
    status: "ok",
    statusCode,
  };

  if (data !== undefined && data !== null && data !== "") {
    response.data = data;
  }

  if (message !== undefined && message !== null && message !== "") {
    response.message = message;
  }

  return response;
};

const ErrorResponse = (statusCode, message) => {
  return {
    status: "error",
    statusCode,
    message,
  };
};

module.exports = { createResponse, ErrorResponse };
