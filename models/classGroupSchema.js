const mongoose = require("mongoose");
const classGroupSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },

    department: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },

    semester: {
        type: Number,
        required: true
    },

    section: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },

    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        required: true
    },

    students: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student"
        }
    ],

    subjects: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject"
        }
    ],

    isActive: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true
});

classGroupSchema.index( { college: 1, department: 1, semester: 1, section: 1 }, { unique: true });

const ClassGroup = mongoose.model("ClassGroup", classGroupSchema);

module.exports = ClassGroup;