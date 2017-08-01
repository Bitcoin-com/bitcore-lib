'use strict';

var buffer = require('buffer');

var Signature = require('../crypto/signature');
var Script = require('../script');
var Output = require('./output');
var BufferReader = require('../encoding/bufferreader');
var BufferWriter = require('../encoding/bufferwriter');
var BN = require('../crypto/bn');
var Hash = require('../crypto/hash');
var ECDSA = require('../crypto/ecdsa');
var $ = require('../util/preconditions');
var _ = require('lodash');

var SIGHASH_SINGLE_BUG = '0000000000000000000000000000000000000000000000000000000000000001';
var BITS_64_ON = 'ffffffffffffffff';

/**
 * Returns a buffer of length 32 bytes with the hash that needs to be signed
 * for OP_CHECKSIG.
 *
 * @name Signing.sighash
 * @param {Transaction} transaction the transaction to sign
 * @param {number} sighashType the type of the hash
 * @param {number} inputNumber the input index for the signature
 * @param {Script} subscript the script that will be signed
 */
var sighash = function sighash(transaction, sighashType, inputNumber, subscript) {

  var Transaction = require('./transaction');
  var Input = require('./input');
  // Copy transaction
  var txcopy = Transaction.shallowCopy(transaction);

  subscript = new Script(subscript);
  subscript.removeCodeseparators();

  var i;
  for (i = 0; i < transaction.inputs.length; i++) {
    // Blank signatures for other inputs
    txcopy.inputs[i] = new Input(transaction.inputs[i]).setScript(Script.empty());
  }

  txcopy.inputs[inputNumber] = new Input(txcopy.inputs[inputNumber]).setScript(subscript);

  txcopy.outputs = transaction.outputs;

  if (sighashType & Signature.SIGHASH_FORKID) {
    return sighashBCC(txcopy, sighashType, inputNumber, subscript.toBuffer(),txcopy.inputs[inputNumber].getSatoshisBuffer());
  }





  if ((sighashType & 31) === Signature.SIGHASH_NONE ||
    (sighashType & 31) === Signature.SIGHASH_SINGLE) {

    // clear all sequenceNumbers
    for (i = 0; i < txcopy.inputs.length; i++) {
      if (i !== inputNumber) {
        txcopy.inputs[i].sequenceNumber = 0;
      }
    }
  }

  if ((sighashType & 31) === Signature.SIGHASH_NONE) {
    txcopy.outputs = [];

  } else if ((sighashType & 31) === Signature.SIGHASH_SINGLE) {
    // The SIGHASH_SINGLE bug.
    // https://bitcointalk.org/index.php?topic=260595.0
    if (inputNumber >= txcopy.outputs.length) {
      return new Buffer(SIGHASH_SINGLE_BUG, 'hex');
    }

    txcopy.outputs.length = inputNumber + 1;

    for (i = 0; i < inputNumber; i++) {
      txcopy.outputs[i] = new Output({
        satoshis: BN.fromBuffer(new buffer.Buffer(BITS_64_ON, 'hex')),
        script: Script.empty()
      });
    }
  }

  if (sighashType & Signature.SIGHASH_ANYONECANPAY) {
    txcopy.inputs = [txcopy.inputs[inputNumber]];
  }

  var buf = new BufferWriter()
    .write(txcopy.toBuffer())
    .writeInt32LE(sighashType)
    .toBuffer();
  var ret = Hash.sha256sha256(buf);
  ret = new BufferReader(ret).readReverse();
  return ret;
};





/**
 * Returns a buffer of length 32 bytes with the hash that needs to be signed
 * for OP_CHECKSIG.
 *
 * @name Signing.sighash
 * @param {Transaction} transaction the transaction to sign
 * @param {number} sighashType the type of the hash
 * @param {number} inputNumber the input index for the signature
 * @param {Script} subscript the script that will be signed
 */
//var sighashBCC = function sighashBCC(transaction, sighashType, inputNumber, subscript) {

var sighashBCC = function sighashBCC(transaction, sighashType, inputNumber, scriptCode, satoshisBuffer) {



  /* jshint maxstatements: 50 */



  var ZERO = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
  var hashOutputs = ZERO
  var hashPrevouts = ZERO
  var hashSequence = ZERO



  // var hashPrevouts;
  // var hashSequence;
  // var hashOutputs;

  if (!(sighashType & Signature.SIGHASH_ANYONECANPAY)) {
    var buffers = [];
    for (var n = 0; n < transaction.inputs.length; n++) {
      var input = transaction.inputs[n];
      var prevTxIdBuffer = new BufferReader(input.prevTxId).readReverse();
      buffers.push(prevTxIdBuffer);
      var outputIndexBuffer = new Buffer(new Array(4));
      outputIndexBuffer.writeUInt32LE(input.outputIndex, 0);
      buffers.push(outputIndexBuffer);
    }
     hashPrevouts = Hash.sha256sha256(Buffer.concat(buffers));
  }




  if (!(sighashType & Signature.SIGHASH_ANYONECANPAY) &&
      (sighashType & 0x1f) !== Signature.SIGHASH_SINGLE && (sighashType & 0x1f) !== Signature.SIGHASH_NONE) {

    var sequenceBuffers = [];
    for (var m = 0; m < transaction.inputs.length; m++) {
      var sequenceBuffer = new Buffer(new Array(4));
      sequenceBuffer.writeUInt32LE(transaction.inputs[m].sequenceNumber, 0);
      sequenceBuffers.push(sequenceBuffer);
    }

    //hashSequence = new BufferReader(Hash.sha256sha256(Buffer.concat(sequenceBuffers))).readReverse();
    hashSequence = Hash.sha256sha256(Buffer.concat(sequenceBuffers));

  }

  var outputWriter = new BufferWriter();
  if ((sighashType & 0x1f) !== Signature.SIGHASH_SINGLE && (sighashType & 0x1f) !== Signature.SIGHASH_NONE) {
    for (var p = 0; p < transaction.outputs.length; p++) {
      transaction.outputs[p].toBufferWriter(outputWriter);
    }
    //hashOutputs = new BufferReader(Hash.sha256sha256(outputWriter.toBuffer())).readReverse();
    hashOutputs = Hash.sha256sha256(outputWriter.toBuffer());
  } else if ((sighashType & 0x1f) === Signature.SIGHASH_SINGLE && inputNumber < transaction.outputs.length) {
    transaction.outputs[inputNumber].toBufferWriter(outputWriter);
    //hashOutputs = new BufferReader(Hash.sha256sha256(outputWriter.toBuffer())).readReverse();
    hashOutputs = Hash.sha256sha256(outputWriter.toBuffer());
  }






  // Version
  var writer = new BufferWriter();
  writer.writeUInt32LE(transaction.version);
  console.log("Intermedian hash 1:", new BufferReader(Hash.sha256sha256(writer.toBuffer())).readReverse().toString('hex'));

  // Input prevouts/nSequence (none/all, depending on flags)
  writer.write(hashPrevouts);
  console.log("Intermedian hash 2:", new BufferReader(Hash.sha256sha256(writer.toBuffer())).readReverse().toString('hex'));
  writer.write(hashSequence);
  console.log("Intermedian hash 3:", Hash.sha256sha256(writer.toBuffer()).toString('hex'));

  // The input being signed (replacing the scriptSig with scriptCode + amount)
  // The prevout may already be contained in hashPrevout, and the nSequence
  // may already be contain in hashSequence.
   var outpointId = new BufferReader(transaction.inputs[inputNumber].prevTxId).readAll();

   writer.writeReverse(outpointId);
   console.log("Intermedian hash 4:", Hash.sha256sha256(writer.toBuffer()).toString('hex'));
   writer.writeUInt32LE(transaction.inputs[inputNumber].outputIndex);
   console.log("Intermedian hash 5:", Hash.sha256sha256(writer.toBuffer()).toString('hex'));

  //  writer.write(scriptCode);
  writer.write(new Buffer('76a914fe34e795175b054fc76434d0340264722d6c1acd88ac','hex'));
  //writer.write(bitcore.Script(new Buffer('76a914fe34e795175b054fc76434d0340264722d6c1acd88ac','hex')).toBuffer());

    console.log("Intermedian hash 6:", Hash.sha256sha256(writer.toBuffer()).toString('hex'));
  //
  writer.write(satoshisBuffer);
  console.log("Intermedian hash 7:", Hash.sha256sha256(writer.toBuffer()).toString('hex'));

  // var c = new BN('10000',10);
  // writer.writeUInt64LEBN( new BN('10000',10) );


   writer.writeUInt32LE(transaction.inputs[inputNumber].sequenceNumber);
   console.log("Intermedian hash 8:", Hash.sha256sha256(writer.toBuffer()).toString('hex'));

  // Outputs (none/one/all, depending on flags)
   writer.write(hashOutputs);
   console.log("Intermedian hash 9:", Hash.sha256sha256(writer.toBuffer()).toString('hex'));

  // Locktime
  writer.writeUInt32LE(transaction.nLockTime);
  console.log("Intermedian hash 10:", Hash.sha256sha256(writer.toBuffer()).toString('hex'));

  // Sighash type
  writer.writeInt32LE(sighashType | Signature.SIGHASH_FORKID);

  console.log('=======================================');
  console.log('version: ' + transaction.version);
  console.log('hashPrevOuts: ' + hashPrevouts.toString('hex'));
  console.log('hashSequence: ' + hashSequence.toString('hex'));
  console.log(outpointId.toString('hex'), transaction.inputs[inputNumber].outputIndex);
  console.log('prevOutScript: ' + scriptCode.toString('hex'));
  console.log('hashOutputs: ' + hashOutputs.toString('hex'));
  console.log('amount: ' + satoshisBuffer.toString('hex'));
  console.log('sequence: ' + transaction.inputs[inputNumber].sequenceNumber);
  console.log('locktime: ' + transaction.nLockTime);
  console.log('hashtype: ' + (sighashType | Signature.SIGHASH_FORKID));


  var ret = Hash.sha256sha256(writer.toBuffer());
  ret = new BufferReader(ret).readReverse();
  console.log("hash:",ret.toString("hex"));
  console.log('=======================================');
  console.log(writer.toBuffer().toString('hex'));
  console.log('=======================================');

  return ret;
  //var h = Hash.sha256sha256(writer.toBuffer());

  var h = Hash.sha256sha256(writer.toBuffer());
  console.log("FORK hash:");
  console.log(h.toString("hex"));
  return h;


};



/**
 * Create a signature
 *
 * @name Signing.sign
 * @param {Transaction} transaction
 * @param {PrivateKey} privateKey
 * @param {number} sighash
 * @param {number} inputIndex
 * @param {Script} subscript
 * @return {Signature}
 */
function sign(transaction, privateKey, sighashType, inputIndex, subscript) {

  var hashbuf = sighash(transaction, sighashType, inputIndex, subscript);

  var sig = ECDSA.sign(hashbuf, privateKey, 'little').set({
    nhashtype: sighashType
  });
  return sig;
}

/**
 * Verify a signature
 *
 * @name Signing.verify
 * @param {Transaction} transaction
 * @param {Signature} signature
 * @param {PublicKey} publicKey
 * @param {number} inputIndex
 * @param {Script} subscript
 * @return {boolean}
 */
function verify(transaction, signature, publicKey, inputIndex, subscript) {
  $.checkArgument(!_.isUndefined(transaction));
  $.checkArgument(!_.isUndefined(signature) && !_.isUndefined(signature.nhashtype));
  var hashbuf = sighash(transaction, signature.nhashtype, inputIndex, subscript);
  return ECDSA.verify(hashbuf, signature, publicKey, 'little');
}

/**
 * @namespace Signing
 */
module.exports = {
  sighash: sighash,
  sign: sign,
  verify: verify
};
