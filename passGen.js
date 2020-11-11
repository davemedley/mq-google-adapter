/**
 * This application demonstrates how to read from GPS and write to MQ
 * Author David Medley 13 Oct 2020
 */

'use strict';


// Get command line parameters
var myArgs = process.argv.slice(2); // Remove redundant parms
var passwordIn = myArgs[0];

const bcrypt = require("bcryptjs");
bcrypt.hash(passwordIn, 8)
  .then(password => {
    console.log(password); // hashed password
});