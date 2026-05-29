const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Student = require("../models/studentSchema");
const Teacher = require("../models/teacherSchema");
const Classroom = require("../models/classroomSchema");
const Subject = require("../models/subjectSchema");
const ClassGroup = require("../models/classGroupSchema");

async function fixDeletedRecords() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.");

        let ts = Date.now();
        
        function getSuffix(type) {
            return `_${type}_${ts++}`;
        }

        // 1. Fix deleted Students
        const deletedStudents = await Student.find({ isDeleted: true });
        for (const student of deletedStudents) {
            let updated = false;
            if (!student.email.includes("_deleted_")) {
                student.email = student.email + getSuffix("deleted");
                updated = true;
            }
            if (!student.enrollmentNumber.includes("_DELETED_")) {
                student.enrollmentNumber = student.enrollmentNumber + getSuffix("DELETED");
                updated = true;
            }
            if (updated) await student.save();
        }
        console.log(`Processed ${deletedStudents.length} deleted students.`);

        // 2. Fix deleted Teachers
        const deletedTeachers = await Teacher.find({ isDeleted: true });
        for (const teacher of deletedTeachers) {
            let updated = false;
            if (!teacher.email.includes("_deleted_")) {
                teacher.email = teacher.email + getSuffix("deleted");
                updated = true;
            }
            if (!teacher.employeeId.includes("_DELETED_")) {
                teacher.employeeId = teacher.employeeId + getSuffix("DELETED");
                updated = true;
            }
            if (updated) await teacher.save();
        }
        console.log(`Processed ${deletedTeachers.length} deleted teachers.`);

        // 3. Fix deleted Classrooms
        const deletedClassrooms = await Classroom.find({ isDeleted: true });
        for (const classroom of deletedClassrooms) {
            if (!classroom.roomNumber.includes("_DELETED_")) {
                classroom.roomNumber = classroom.roomNumber + getSuffix("DELETED");
                await classroom.save();
            }
        }
        console.log(`Processed ${deletedClassrooms.length} deleted classrooms.`);

        // 4. Fix archived Subjects
        const archivedSubjects = await Subject.find({ isActive: false });
        for (const subject of archivedSubjects) {
            if (!subject.subjectCode.includes("_ARCHIVED_")) {
                subject.subjectCode = subject.subjectCode + getSuffix("ARCHIVED");
                await subject.save();
            }
        }
        console.log(`Processed ${archivedSubjects.length} archived subjects.`);

        // 5. Fix archived Class Groups
        const archivedClassGroups = await ClassGroup.find({ isActive: false });
        for (const cg of archivedClassGroups) {
            if (!cg.section.includes("_ARCHIVED_")) {
                cg.section = cg.section + getSuffix("ARCHIVED");
                await cg.save();
            }
        }
        console.log(`Processed ${archivedClassGroups.length} archived class groups.`);

        console.log("Finished successfully!");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

fixDeletedRecords();
