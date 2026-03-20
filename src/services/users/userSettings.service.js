import sql from "../../config/db.js";

// Terms and Condition
export const acceptTerms = async ({ userId }) => {
  const updateQuery = `
    UPDATE users
    SET terms_and_condition = TRUE
    WHERE id= $1
  `;

  await sql.query(updateQuery, [userId]);

  return {
    statusCode: 200,
    body: { success: true, message: "Terms and conditions accepted successfully" },
  };
};

// need help
export const needHelp = async ({ userId, message }) => {
  if (!message) {
    return {
      statusCode: 500,
      body: { message: "Message Field is required" },
    };
  }

  const { rows } = await sql.query(
    `INSERT into helpline (user_id , message)
     VALUES ($1 , $2)
     RETURNING *`,
    [userId, message.trim()],
  );

  return {
    statusCode: 200,
    body: {
      status: true,
      message: "Support request submitted Successfully",
      data: rows[0],
    },
  };
};

// push_notification
export const allowNotification = async ({
  userId,
  is_notification_allowed,
}) => {
  if (typeof is_notification_allowed !== "boolean") {
    return {
      statusCode: 400,
      body: {
        success: false,
        message: "is_notification_allowed must be true or false",
      },
    };
  }

  await sql.query(
    `UPDATE users
     SET push_notification = $1
     WHERE id = $2`,
    [is_notification_allowed, userId],
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message: `Push notification ${
        is_notification_allowed ? "enabled" : "disabled"
      } successfully`,
    },
  };
};

