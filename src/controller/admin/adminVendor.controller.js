import { addVendorService, updateVendorService } from '../../services/vendor/vendor.service.js';

export const addVendor = async (req, res, next) => {
    try {
        const data = await addVendorService(req.body, req.file);
        return res.status(201).json({ success: true, message: 'Vendor added successfully', data });
    } catch (err) {
        if (err.code === '23505')
            return res.status(400).json({ success: false, message: 'Email already exists' });
        if (err.status)
            return res.status(err.status).json({ success: false, message: err.message });
        next(err);
    }
};

export const updateVendor = async (req, res , next ) => {
  try {
    const data = await updateVendorService(
      req.params.id,
      req.body,
      req.file
    );
    return res.status(200).json({
      success: true,
      message: 'Vendor updated successfully',
      data
    });

  } catch (error) {
     next(error)
  }
};
