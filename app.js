import express from 'express';
import session from 'express-session';
const MySQLStore = require('express-mysql-session')(session); 
import mysql from 'mysql2/promise';
require("dotenv").config();

const port = 3000;

const options = {
  host     : process.env.DB_HOST,
  user     : process.env.DB_USER,
  password : process.env.DB_PW,
  database : process.env.DB_DB
};

const db = mysql.createPool(options);
const sessionStore = new MySQLStore(options);    

const app = express();

app.use(session({
  secure: false,
  secret: process.env.SESSION_KEY,
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    Secure: false
  }
}));

app.get('/api/main', async (req, res) => {
  const [rows, fields] = await db.execute(
    `SELECT * FROM post`, []
  );

  res.json(rows);
})

// app.get('/api/main', async (req, res) => {
//   res.json([{ id: 1, username: "daisy" }]);
// })

// app.get('/api/main', async (req, res) => {
//   res.json([{ id: 1, username: "daisy" }]);
// })

// app.get('/api/main', async (req, res) => {
//   res.json([{ id: 1, username: "daisy" }]);
// })

app.listen(port, () => {
  console.log(`http://192.168.1.117:${port}/api/main`)
})