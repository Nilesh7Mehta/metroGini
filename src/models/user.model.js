import sql from '../config/db.js';

//Login-Or-Register
export const findUserByMobile = async (mobile) => {
    const query = 'SELECT * FROM users WHERE mobile = $1';
    const values = [mobile];
    const { rows } = await sql.query(query, values);
    return rows[0];
}