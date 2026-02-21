import sql from "../config/db.js";

export const getCities = async (req, res, next) => {
    try {
        const { rows } = await sql.query(`SELECT * FROM cities order by id desc`);
        res.status(200).json({
            success: true,
            message: "Cities retrieved successfully",
            data: rows,
        });
    } catch (error) {
        next(error);
    }
};

export const getServices = async (req, res, next) => {
    try {
        const { rows } = await sql.query(`SELECT * FROM services order by id desc`);
        res.status(200).json({
            success: true,
            message: "Services retrieved successfully",
            data: rows,
        });
    } catch (error) {
        next(error);
    }
};

export const getServiceTypes = async (req, res, next) => {
    try {
        const { rows } = await sql.query(`SELECT * FROM service_types order by id desc`);
        res.status(200).json({
            success: true,
            message: "Service types retrieved successfully",
            data: rows,
        });
    }
        catch (error) {
        next(error);
    }
};

export const getTimeSlots = async (req, res, next) => {
    try {
        const { rows } = await sql.query(`SELECT * FROM time_slots where is_active = true `); 
        res.status(200).json({
            success: true,
            message: "Time slots retrieved successfully",
            data: rows,
        });
    } catch (error) {
        next(error);
    }
};
