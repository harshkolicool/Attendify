const mongoose = require("mongoose");
const Classroom = require("../models/classroomSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});

const updateClassroomLocation = async () => {
    try {

        const classroom = await Classroom.findOneAndUpdate(
            {
                classroomName: "Room 101"
            },
            {
                latitude: 12.9715,     // replace with YOUR latitude
                longitude: 77.5944,    // replace with YOUR longitude
                radius: 500            // 500 meters for testing
            },
            {
                new: true
            }
        );

        console.log("Classroom location updated");
        console.log(classroom);

        mongoose.connection.close();

    } catch (err) {
        console.log(err);
        mongoose.connection.close();
    }
};

updateClassroomLocation();