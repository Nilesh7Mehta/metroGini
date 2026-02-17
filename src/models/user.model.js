import sql from '../config/db.js';
export const getAllUsers = async (req, res) => {
    try {
        const users = await sql `SELECT * FROM users`;
        // console.log(users);
        return users;
    } catch (error) {
        throw error;
    }
};

export const getUserById = async (id) => {
    try {
        const user = await sql `SELECT * FROM users WHERE id = ${id}`; 
        return user[0]; // Return the first user found (or undefined if not found)
    } catch (error) {
        throw error;
    }
};

export const createNewUser = async (userData) => {
    try {
        const result = await sql `INSERT INTO users (name, email) VALUES (${userData.name}, ${userData.email}) RETURNING *`;
        return result[0]; 
    } catch (error) {
        throw error;
    } 
};