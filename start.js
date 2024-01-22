const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const { exec } = require('node:child_process')

app.use(bodyParser.json());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


app.post('/api/ring_ring', (req, res) => {

exec('ls ./', (err, output) => {
    // once the command has completed, the callback function is called
    if (err) {
        // log and return if we encounter an error
        console.error("could not execute command: ", err)
        return
    }
    // log the output received from the command
    console.log("Output: \n", output)
})


  
  res.status(200).json( { Status: 'OK'});
});
