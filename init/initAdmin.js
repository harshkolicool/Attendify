const mongoose = require("mongoose");
const Teacher = require("../models/teacherSchema");
const College = require("../models/collegeSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => console.log("MongoDB Connected"))
.catch((err) => console.log("MongoDB Error:", err.message));

async function initAdmin() {
    try {
        const college = await College.findOne({ collegeCode: "MIT001" });

        if (!college) {
            console.log("College MIT001 not found. Create a college first.");
            mongoose.connection.close();
            return;
        }

        const aman = await Teacher.findOne({ email: "aman@college.com" });

        if (aman) {
            aman.role = "ADMIN";
            await aman.save();
            console.log("Updated aman@college.com to ADMIN role");
        }

        let adminUser = await Teacher.findOne({ email: "admin@college.com" });

        if (!adminUser) {
            adminUser = await Teacher.create({
                fullName: "College Admin",
                email: "admin@college.com",
                password: "admin123",
                employeeId: "ADMIN001",
                department: "CSE",
                college: college._id,
                role: "ADMIN",
                subjects: []
            });

            console.log("Created admin@college.com / admin123");
        } else {
            adminUser.role = "ADMIN";
            adminUser.college = college._id;
            await adminUser.save();
            console.log("Updated admin@college.com to ADMIN role");
        }

        console.log("Admin setup complete");
        mongoose.connection.close();

    } catch (err) {
        console.log("INIT ADMIN ERROR:", err.message);
        mongoose.connection.close();
    }
}

initAdmin();
