const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const { Schema } = mongoose;

const studentSchema = new Schema({}, { strict: false });
const Student = mongoose.model('Student', studentSchema);

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const students = await Student.find({}).lean();
    students.forEach(s => console.log(s.fullName));
    process.exit(0);
}
check().catch(console.error);
