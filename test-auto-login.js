const mongoose = require('mongoose');
require('dotenv').config();
const Student = require('./models/studentSchema');
const College = require('./models/collegeSchema');
const ClassGroup = require('./models/classGroupSchema');

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    const college = await College.findOne();
    const classGroup = await ClassGroup.findOne();
    
    const token = "test-token-12345";
    
    // Create a dummy student
    const student = new Student({
        fullName: "Test AutoLogin",
        email: "test.autologin@example.com",
        password: "password123",
        enrollmentNumber: "TESTAL123",
        department: "CS",
        semester: 1,
        college: college._id,
        classGroup: classGroup._id,
        isApproved: true,
        autoLoginToken: token
    });
    
    await student.save();
    console.log("Created token: " + token);
    process.exit(0);
}
test().catch(console.error);
