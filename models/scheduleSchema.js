const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema({

    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        required: true
    },

    classGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ClassGroup",
        required: true
    },

    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
        required: true
    },

    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
        required: true
    },

    classroom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Classroom",
        required: true
    },

    day: {
        type: String,
        enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        required: true
    },

    startTime: {
        type: String,
        required: true
    },

    endTime: {
        type: String,
        required: true
    }

}, {
    timestamps: true
});

scheduleSchema.index({ college: 1, day: 1, teacher: 1, startTime: 1 });
scheduleSchema.index({ college: 1, day: 1, classGroup: 1, startTime: 1 });
scheduleSchema.index({ college: 1, day: 1, classroom: 1, startTime: 1 });

const Schedule = mongoose.model("Schedule", scheduleSchema);

module.exports = Schedule;