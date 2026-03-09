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


const userFaqs = [
  {
    id: 1,
    question: "Can I reschedule my pickup?",
    answer: "Yes! You can reschedule up to 6 hours before your selected pickup time."
  },
  {
    id: 2,
    question: "How does the laundry by kilo service work?",
    answer: "We weigh your clothes and charge only for the total laundry weight. It’s simple, fair, and transparent."
  },
  {
    id: 3,
    question: "What happens if my clothes are damaged or misplaced?",
    answer: "In rare cases, our customer support will review and resolve the issue promptly."
  },
  {
    id: 4,
    question: "Do I need to separate colored and white clothes?",
    answer: "Not necessary — our trained experts handle sorting before washing."
  },
  {
    id: 5,
    question: "When do I make the final payment?",
    answer: "The final payment is due after your laundry is delivered back to you."
  }
];

export const userFaq = async(req , res ,next) =>{
    try{
        res.status(200).json({
            status:true,
            message: 'FAQ retrieved successfully',
            data:userFaqs
        }  
        )

    }catch(error){
        next(error);
    }
}


export const shift = async(req , res , next) =>{
    try{
        const {rows} = await sql.query(`SELECT * from shifts`);
        res.status(200).json({
            success:true,
            message: 'Shift retrieved Successfully',
            data:rows
        })
    }catch(error){
        next(error)
    }
}
