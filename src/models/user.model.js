import sql from '../config/db.js';

//Login-Or-Register
export const findUserByMobile = async (mobile) => {
    // Prefer app customers so shared admin/customer mobiles do not break OTP login
    const query = `SELECT * FROM users WHERE mobile = $1 AND role::text = 'user' LIMIT 1`;
    const values = [mobile];
    const { rows } = await sql.query(query, values);
    return rows[0];
}

