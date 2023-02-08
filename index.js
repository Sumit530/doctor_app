const express = require("express");
const app = express();
var router = express.Router();
var bodyParser = require("body-parser");
var mysql = require("mysql");
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const { query } = require("express-validator");
const json = require("body-parser/lib/types/json");
const io = new Server(server);
const multer = require("multer")
const form = multer().array()
require("dotenv").config()
const crypto  = require("crypto")

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());

app.use("/upload",express.static('uploads/'))
app.use((err, req, res, next) => {
  // console.log(err);
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal Server Error";
  res.status(err.statusCode).json({ message: err.message });
});

// create database connection
var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "easywait",
});

// to check database connection
con.connect(function (err) {
  if (err) throw err;
  console.log("Mysql Connected!");
});

const DoctorProfileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/doctor/profile");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix =
      Date.now() + "-" + crypto.randomBytes(6).toString("hex");
    cb(
      null,
      uniqueSuffix +
        "-" +
        file.originalname.slice(
          file.originalname.length - 10,
          file.originalname.length
        )
    );
  },
});

const DoctorProfileUpload = multer({
  storage: DoctorProfileStorage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype == "image/png" ||
      file.mimetype == "image/jpg" ||
      file.mimetype == "image/jpeg"
    ) {
      cb(null, true);
    } else {
      cb(null, false);
      return cb("Only .png, .jpg and .jpeg format allowed!");
    }
  },
  limits:{
    fileSize:2 * 1024 * 1024
  }
});
const DoctorPostStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/doctor/post");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix =
      Date.now() + "-" + crypto.randomBytes(6).toString("hex");
    cb(
      null,
      uniqueSuffix +
        "-" +
        file.originalname.slice(
          file.originalname.length - 10,
          file.originalname.length
        )
    );
  },
});

const DoctorPostUpload = multer({
  storage: DoctorPostStorage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype == "image/png" ||
      file.mimetype == "image/jpg" ||
      file.mimetype == "image/jpeg"
    ) {
      cb(null, true);
    } else {
      cb(null, false);
      return cb("Only .png, .jpg and .jpeg format allowed!");
    }
  },
  limits:{
    fileSize:5 * 1024 * 1024
  }
});


router.get("/", function (req, res) {
  res.sendFile(__dirname + "/index.html");
});

let rooms = [];
var toklist = {};

// API to get all doctor's data
router.get("/getDoctors", (req, res) => {
  //res.send('api called' + fruits);
  con.query("SELECT `id`, `fname`,`lname`, `speciality`, `degree`, `hospital`, `address`, `password`, `phone`,  `created_at` ,case when prof_pic like ('%http://%') or prof_pic like ('%https://%') or prof_pic like ('%www.%') then prof_pic when prof_pic = '' then prof_pic else concat('${process.env.DOCTOR_PROFILE}',profile) end as prof_pic FROM doctor", function (err, result, fields) {
    if (err) throw err;
    var fn = {};
    fn["status"] = 1;
    fn["message"] = "details found"
    fn["doctors"] = result;
    res.json(fn);
  });
});

// To get appointment details of specific user through id with doctor name and id
router.get("/user/:id", function (req, res) {
  con.query(
    "SELECT apoint.drid AS doctor_id,doctor.name AS doctor_name,apoint.ismor,apoint.adate AS appointment_date FROM apoint JOIN doctor ON apoint.drid=doctor.id WHERE uid = ?",
    [req.params.id],
    function (err, result) {
      if (err) throw err;
      res.json({status:1,result});
    }
  );
});

router.get('/showappoint', function(req, res){
  con.query('SELECT id,token,ismor,adate FROM apoint WHERE drid =? AND adate =?',[req.body.drid,req.body.adate], function(err, result){
    if (err) return res.json({status:0,message:"internal server error"});
    res.json(result)
  })
})


// API to register user and display error if phone number exists
router.post("/user/register",form, function (req, res) {
  console.log(req.body)
  con.query(
    "SELECT * FROM user WHERE phone = ?",
    [req.body.phone],
    function (err, result) {
      if (result.length) {
        return res
          .status(409)
          .send({ status:0,message: "User phone number is already in use!" });
      } else {
        let data = {
          name: req.body.name,
          phone: req.body.phone,
          fcm: req.body.fcm,
        };
        con.query("INSERT INTO user SET ?", data, function (err, result) {
          if (err) throw err;
          return res.status(201).send({ status:1,message: "The user has been registerd!" });
        });
      }
    }
  );
});

// API to login user
router.post("/user/login",form, function (req, res) {
  con.query(
    "SELECT * FROM user WHERE name = ? AND phone = ?",
    [req.body.name, req.body.phone],
    function (err, result) {
      if (err) throw err;
      if (result.length) {
        console.log(result)
        res.json({status:1, result });
      } else {
        return res.status(404).send({ status:0,message: "Invalid name or phone number" });
      }
    }
  );
});

// API to get particular details of doctor using id
router.get("/doctor/:id", function (req, res) {
  con.query(
    "SELECT * FROM doctor WHERE id = ?",
    [req.params.id],
    function (err, result) {
      if (err) throw err;
      const doctor_details = JSON.parse(JSON.stringify(result))
      con.query(`select id , concat( '${process.env.DOCTOR_POST}/',post) as post,description,created_date from doctor_post where doctor_id=${req.params.id}`,(err,data)=>{
        if (err) throw err;
        const post_details = JSON.parse(JSON.stringify(data))
        con.query(`select token from appoint where drid= ${req.params.id} order by updated desc limit 1 `,(err,data)=>{
          if(err) return res.json({status:0,message:"internal server error"});
          const token = JSON.parse(JSON.stringify(data))
          if(doctor_details.length>0){
            const result = [{doctor:doctor_details,current_token:token,post:post_details}]
            res.json({status:1,message:"doctor details found",result})  
            
          }else{
            res.json({status:1,message:"doctor details not found"})  
          }
        })
        res.json({status:1,result,post:data});
      })
    }
  );
});

// API to login doctor
// router.post("/doctor/login",form, function (req, res) {
//   con.query(
//     "SELECT * FROM doctor WHERE name = ? AND password = ?",
//     [req.body.name, req.body.password],
//     function (err, result) {
//       if (err) throw err;
//       if (result.length) {
//         res.json({ status:1,result });
//       } else {
//         return res.status(404).send({ status:0,message: "Invalid name or password" });
//       }
//       // res.end(JSON.stringify(result));
//     }
//   );
// });

// API for upload post 
router.post("/doctor/uploadpost", DoctorPostUpload.single("post"),function (req, res) {
  if(!req.body.id || req.body.id == ""){
    return res.json({status:0,message:"please provide doctor id"})
  }
  if(!req?.file){
    return res.json({status:0,message:"please provide a post image"})
  }
 
  con.query(
    `insert into doctor_post(doctor_id,post,description) values(${req.body.id},'${req?.file?.filename}','${req?.body?.description}')`,
    function (err, result) {
      if (err) {console.log(err); return res.json({status:0,message:"internal server error"});}
    
      if (result) {
        res.json({ status:1,result });
      } else {
        return res.status(404).send({ status:0,message: "internal server error when uploading post" });
      }
      // res.end(JSON.stringify(result));
    }
  );
});
router.post("/doctor/updatepost", DoctorPostUpload.single("post"),function (req, res) {
  if(!req.body.id || req.body.id == ""){
    return res.json({status:0,message:"please provide doctor id"})
  }
  if(!req?.file){
    return res.json({status:0,message:"please provide a post image"})
  }
 
  con.query(
    `update doctor_post set post = '${req?.file?.filename}', description = '${req?.body?.description}' where id = ${req.body.id}`,
    function (err, result) {
      if (err) {console.log(err);return res.json({status:0,message:"internal server error"});}
    
      if (result) {
        const data = JSON.parse(JSON.stringify(result))
        console.log(result)
        res.json({ status:1,message:"post updated successfully",result });
      } else {
        return res.status(404).send({ status:0,message: "internal server error when uploading post" });
      }
      // res.end(JSON.stringify(result));
    }
  );
});


router.post("/doctor/deletepost",(req,res)=>{
  con.query(`delete from doctor_post where id = ${req.body.id}`,(err,data)=>{
    if(err) return res.json({status:0,message:"internal server error"})
    const result = JSON.parse(JSON.stringify(data)) 
    if(result.length>0){
      return res.json({status:1,message:"post deleted successfully"})

    }
    else {
      return res.json({status:0,message:"error occured when deleting post"})

    }
  })
})

// API to register doctor and display error if phone number exists

router.post("/doctor/register",DoctorProfileUpload.single("prof_pic") ,function (req, res) {
  con.query(
    "SELECT * FROM doctor WHERE phone = ?",
    [req.body.phone],
    function (err, result) {
      if (result.length>0) {
        return res.status(409).send({status:0,message: "Phone number is already in use!" });
      } else {
        let data = {
          fname: req.body.fname,
          lname: req.body.lname,
          speciality: req.body.speciality,
          degree: req.body.degree,
          hospital: req.body.hospital,
          address: req.body.address,
          password: req.body.password,
          phone: req.body.phone,
          prof_pic: req.file.filename,
        };
        con.query("INSERT INTO doctor SET ?", data, function (err, result) {
          if (err) throw err;
          return res
            .status(201)
            .send({ status:1,message: "You are successfully registered!" });
          // res.end(JSON.stringify(result));
        });
      }
    }
  );
});

// API to search particular doctor through name and hospital name
router.get("/search/doctor/:search", function (req, res) {
  if(req.params.search && req.params.search != "" ){

    let search = req.params.search;
    con.query(
      "SELECT id,fname,lname,hospital,address,phone FROM doctor WHERE (CONCAT(name, hospital) LIKE ? )",
      "%" + search + "%",
      function (err, result) {
        if (err) throw err;
        res.json({status:1,result});
      }
      );
    }else{
      con.query(
        "SELECT id,fname,lname,hospital,address,phone FROM doctor",
        function (err, result) {
          if (err) throw err;
          res.json({status:1,result});
        }
        );
    }
});

// API to update details of doctor through it's id
router.put("/update/doctor_details",DoctorProfileUpload.single("prof_pic") ,function (req, res) {
  let fname = req.body.fname;
  let lname = req.body.lname;
  let hospital = req.body.hospital;
  let speciality = req.body.speciality
  let address = req.body.address;
  let prof_pic = req.file.filename;
  let degree = req.body.degree
  let id = req.body.id;
  con.query(
    "UPDATE doctor SET name = ?, hospital = ?, speciality = ? , address = ?, prof_pic = ? degree = ? WHERE id = ?",
    [
      fname,
      lname,
      hospital,
      speciality,
      address,
      prof_pic,
      degree,
      id,
    ],
    function (error, result) {
      if (error) throw error;
      return res.send({status:1 , message: "Updated successfully!" });
    }
  );
});

router.post('/doctor/setting/morning',(req,res)=>{
  con.query(`select id from doctor_leave where doctor_id=${req.body.doctor_id}`,(err,data)=>{
    const checkData = JSON.parse(JSON.stringify(data))
    if(checkData.length>0){
      con.query(`update doctor_leave set morning_start = ${req.body.morning_start},morning_end = ${req.body.morning_end} where doctor_id=${req.body.doctor_id}`,(err,data)=>{
        if (err) return res.json({status:0,message:"internal server error"})
        else{
          return res.json({status:1,message:"setting updated successfully"})
        }
      })
    }else{

      con.query(`insert into doctor_leave set doctor_id=${req.body.doctor_id},morning_start = ${req.body.morning_start},morning_end = ${req.body.morning_end}`,(err,data)=>{
        if (err) return res.json({status:0,message:"internal server error"})
        else{
          return res.json({status:1,message:"setting inserted successfully"})
        }
      })
    }
  })
})
router.post('/doctor/setting/evening',(req,res)=>{
  con.query(`select id from doctor_leave where doctor_id=${req.body.doctor_id}`,(err,data)=>{
    const checkData = JSON.parse(JSON.stringify(data))
    if(checkData.length>0){
      con.query(`update doctor_leave set evening_start = ${req.body.evening_start},evening_end = ${req.body.evening_end} where doctor_id=${req.body.doctor_id}`,(err,data)=>{
        if (err) return res.json({status:0,message:"internal server error"})
        else{
          return res.json({status:1,message:"setting updated successfully"})
        }
      })
    }else{

      con.query(`insert into doctor_leave set doctor_id=${req.body.doctor_id},evening_start = ${req.body.evening_start},evening_end = ${req.body.evening_end}`,(err,data)=>{
        if (err) return res.json({status:0,message:"internal server error"})
        else{
          return res.json({status:1,message:"setting inserted successfully"})
        }
      })
    }
  })
})
router.post("doctor/showholidays",(req,res)=>{
  con.query(`select leave_date as holiday,sunday_morning,sunday_evening from doctor_leave where dorcor_id=${req.body.doctor_id}`,(err,data)=>{
    if(err) return res.json({status:0,message:"internal server error"})
    const result = JSON.parse(JSON.stringify(data))
    if(data.length > 0){
      return res.json({status : 1 , message:"leaves found",result:result[0]})
    }
    else{
      return res.json({status : 0 , message:"leaves not found"})
    }
  })
})
router.post('/doctor/setting/holiday',(req,res)=>{
  con.query(`select id from doctor_leave where doctor_id=${req.body.doctor_id}`,(err,data)=>{
    const checkData = JSON.parse(JSON.stringify(data))
    if(checkData.length>0){
      con.query(`update doctor_leave set sunday_morning = ${req.body.sunday_morning},sunday_evening = ${req.body.sunday_evening},leave_date = ${req.body.holydays} where doctor_id=${req.body.doctor_id}`,(err,data)=>{
        if (err) return res.json({status:0,message:"internal server error"})
        else{
          return res.json({status:1,message:"setting updated successfully"})
        }
      })
    }else{

      con.query(`insert into doctor_leave set doctor_id=${req.body.doctor_id},evening_start = ${req.body.sunday_morning},evening_end = ${req.body.sunday_evening}`,(err,data)=>{
        if (err) return res.json({status:0,message:"internal server error"})
        else{
          return res.json({status:1,message:"setting inserted successfully"})
        }
      })
    }
  })
})

router.post(`/doctor/showholidays`,(req,res)=>{

})



// API to get id of user through phone number
router.post("/get",form, function (req, res) {
  con.query(
    "SELECT id FROM user WHERE name = ? AND phone = ?",
    [req.body.name, req.body.phone],
    function (error, result) {
      if (result.length) {
        res.json({status:1,result});
      } else {
        // let data = {name: req.body.name, phone: req.body.phone}
        con.query(
          "INSERT INTO user (name, phone) VALUES (?,?)",
          [req.body.name, req.body.phone],
          function (error, result) {
            if (error) throw error; 
            console.log(result.insertId)
            console.log(result[0])
            // console.log((result[0])[0].id)
            res.json({status:1,result:result.insertId});
          }
        );
      }
    }
  );
});

// API to check if doctor is available on sunday morning
// router.get('/doctor', function(req, res){
//   con.query('SELECT id,name,hospital,address,phone FROM doctor WHERE sun_mor = ?', [req.body.sun_mor], function(error, result){
//     if (error) throw error;
//     res.json(result);
//   })
// })

// API to check if doctor is available on sunday evening
// router.get('/doctor-even', function(req, res){
//   con.query('SELECT id,name,hospital,address,phone FROM doctor WHERE sun_even = ?', [req.body.sun_even], function(error, result){
//     if (error) throw error;
//     res.json(result);
//   })
// })

app.use("/api", router);

// socket connection
io.on("connection", (socket) => {
  print("a user connected " + socket.id);

  // join to a room
  socket.on("join", function (data) {
    print("a user Joined " + data.docroom);
    socket.join(data.docroom); // We are using room of socket io
    rooms.push(data.docroom);
  });

  // recieved data from client
  socket.on("changeToken", (msg) => {
    io.sockets.in(msg.docroom).emit("changeToken", msg); // send data back to client
    toklist[msg.docroom] = msg;
    print(toklist);
    //print(msg.docroom + ' tokenChange : ' + msg.token);
  });
  

  socket.on("bookappoin", (msg) => {
    con.query(
      `INSERT INTO apoint (token, uid, drid, ismor,adate) VALUES (?, ?, ?, ?, ?);`,
      [msg.token, msg.uid, msg.drid, msg.ismor, msg.isBookedByDr,msg.adate],
      function (err, result) {
        if (err) throw err;
        print("Row inserted with id = " + result);
        updateAppoins(msg);
      }
    );
  });
   socket.on('cancelappoin',(msg)=>{
    con.query(`delete from appoint where drid = ${msg.drid} and token = ${msg.token}`,(err,data)=>{
      if(err) console.log(err + "  on cancelappoin")
      print("Row Deleted "+data)
      updateAppoins(msg)
    })
  })

  socket.on("getappoinupdate", (msg) => {
    updateAppoins(msg);
  });
});

function updateAppoins(msg) {
  getAppoinsDrId(msg, function (res) {
    // print(res);
    let obj = new Object();
    if (toklist[msg.drid]) {
      obj["current"] = toklist[msg.drid].token;
      obj["ismor"] = toklist[msg.drid].ismor;
    } else {
      obj["current"] = 0;
      obj["ismor"] = 1;
    }
    obj["appoins"] = res;
    io.sockets.in(msg.drid).emit("appoinupdate", obj);
  });
}

function getAppoinsDrId(msg, callback) {
  con.query(
    "SELECT id,token,ismor,adate FROM `apoint` WHERE drid =? AND adate =?",
    [msg.drid, msg.adate],
    function (err, rows) {
      if (err) throw err;
      return callback(rows);
    }
  );
}

function print(abc) {
  console.log(abc);
}

server.listen(3030, () => {
  console.log("listening on *:3030");
});

//https://drive.google.com/file/d/1-TNEPDYD5kQBzHs9-fk3fdlAtbHF5cqS/view