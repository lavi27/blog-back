import express from 'express';
import session from 'express-session';
const MySQLStore = require('express-mysql-session')(session); 
import mysql from 'mysql2/promise';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import cors from 'cors';
require("dotenv").config();


const port = process.env.PORT;

const options = {
  host     : process.env.DB_HOST,
  user     : process.env.DB_USER,
  password : process.env.DB_PW,
  database : process.env.DB_DB
};

const db = mysql.createPool(options);
const sessionStore = new MySQLStore(options);    

const app = express();
const api = express.Router();

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
app.use(cors({
  origin : "http://blog-lavi.kro.kr",
  credentials: true,
}));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use('/api', api);

app.listen(port, () => {
  console.log(`http://192.168.1.117:${port}/api/main`)
})


// /main
// /post/1231231
// /headerInfo
// /edit
// /delete
// /reaction
// /signin
// /signup
// /write

api.get('/main', async (req, res) => {
  const [rows] = await db.execute(`
    SELECT
      *,
      DATE_FORMAT(p.uploadDate, '%Y-%m-%d') AS uploadDate,
      SUBSTRING(p.content, 1, 60) AS content,
      (
        SELECT \`id\`
        from \`user\` u
        WHERE u.userNum = p.userNum
      ) AS userId,
      (
        SELECT COUNT(*)
        from reaction r
        WHERE r.postNum = p.postNum
          AND r.reaction = 1
      ) AS likeCount,
      (
        SELECT COUNT(*)
        from reaction r
        WHERE r.postNum = p.postNum
          AND r.reaction = 2
      ) AS dislikeCount,
      (
        SELECT reaction
        from reaction r
        WHERE r.userNum = ?
          AND r.postNum = p.postNum
      ) AS myReaction
    FROM post p
    ORDER BY p.postNum DESC
    Limit 10`, [(req.session.userNum !== undefined ? req.session.userNum : -1)]
  );

  res.json({data : rows});
})

api.get('/post/:postNum', async (req, res) => {
  const [rows] = await db.execute(`
    SELECT
      p.*,
      DATE_FORMAT(p.uploadDate, '%Y-%m-%d') AS uploadDate,
      (
        SELECT u.id
        FROM \`user\` u
        WHERE u.userNum = p.userNum
      ) AS userId
    FROM post p
    WHERE p.postNum = ?`, [req.params.postNum]
  );

  const [rows2] = await db.execute(`
    SELECT
      reaction,
      userNum
    from reaction
    WHERE postNum = ?`, [req.params.postNum]
  );

  res.json({
    data : rows,
    userNum: (req.session.userNum !== undefined ? req.session.userNum : -1),
    reaction: rows2
  });
})

api.get('/headerInfo', async (req, res) => {
  res.json({
    logging:
      (req.session.userNum !== -1 && req.session.userNum !== undefined && req.session.userNum !== null)
      ? true : false,
    userNum: req.session.userNum,
    id: req.session.userId
  });
})

api.post('/write', async (req, res) => {
  let today = new Date();

  await db.execute(`
    INSERT INTO post
    VALUES (
      ?,
      ?,
      (SELECT MAX(postNum) + 1 FROM \`post\` a),
      null,
      '${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}',
      ?)`,
    [
      req.body.title,
      req.body.content,
      req.body.userNum
    ]
  );

  res.json({success: true});
})

api.post('/edit', async (req, res) => {
  await db.execute(`
    UPDATE post
    SET
      title = ?,
      content = ?
    WHERE postNum = ?`,
    [
      req.body.title,
      req.body.content,
      req.body.postNum
    ]
  );

  res.json({success: true});
})

api.post('/delete', async (req, res) => {
  if(req.session.userNum !== req.body.userNum) {
    res.json({success: false});
    return;
  }

  await db.execute(`
    DELETE FROM post
    WHERE postNum = ?`, [req.body.postNum]
  );

  res.json({success: true});
})

api.post('/reaction', async (req, res) => {
  const [rows] = await db.execute(`
    select EXISTS (
      SELECT *
      FROM reaction
      WHERE postNum = ?
        AND userNum = ?
    ) AS isExist`, [req.body.postNum, req.session.userNum]
  );

  if(rows[0].isExist) {
    await db.execute(`
    UPDATE reaction
    SET reaction = ?
    WHERE postNum = ?
      AND userNum = ?`,
    [
      req.body.reaction,
      req.body.postNum,
      req.session.userNum
    ]
    );
  } else {
    await db.execute(`
    INSERT INTO reaction
    VALUES (?, ?, ?)`,
    [
      req.body.postNum,
      req.body.reaction,
      req.session.userNum
    ]
    );
  }

  res.json({success: true});
})

api.post('/signin', async (req, res) => {
  const [rows] = await db.execute(
    `SELECT pw FROM \`user\` WHERE id = ?`, [req.body.id]
  );

  if(rows.length == 0) {
    res.json({success: false});
    return;
  }
  
  const match = await bcrypt.compare(req.body.pw, rows[0].pw)

  if(!match) {
    res.json({success: false});
    return;
  }

  const [rows2] = await db.execute(
    `SELECT userNum FROM \`user\` WHERE id = ?`, [req.body.id]
  );

  req.session.userId = req.body.id;
  req.session.userNum = rows2[0].userNum;

  res.json({success: true});
})

api.post('/signup', async (req, res) => {
  const [rows] = await db.execute(`
    SELECT EXISTS (
      SELECT *
      FROM \`user\`
      WHERE id = ?
    ) AS isExist`, [req.body.id]
  );

  if(rows[0].isExist) {
    res.json({success: false});
    return;
  }

  const pw = await bcrypt.hash(req.body.pw, 3);

  await db.execute(`
    INSERT INTO \`user\`
    VALUES (?, ?, null, (SELECT MAX(userNum) + 1 FROM \`user\` a))`, [req.body.id, pw]
  );

  const [rows2] = await db.execute(`
    SELECT userNum
    FROM \`user\`
    WHERE id = ?`, [req.body.id]
  );

  req.session.userId = req.body.id;
  req.session.userNum = rows2[0].userNum;

  res.json({success: true});
})

api.get('/signOut', async (req, res) => {
  req.session.userId = null;
  req.session.userNum = null;

  res.json({success: true});
})