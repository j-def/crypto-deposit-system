//var Web3 = require('web3');
import Web3 from 'web3'
const web3 = new Web3('https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161')

interface EthereumAddressData {
    publicKey: string | undefined,
    privateKey: string | undefined
}


function generateAddr(): EthereumAddressData{
    var entropyString = web3.utils.randomHex(32)
    var account = web3.eth.accounts.create(entropyString)
    return {publicKey: account.address, privateKey: account.privateKey}
}

async function createTransaction(sender: EthereumAddressData, receiver: string, sendAmount: string | number): Promise<string | undefined>{
    if (typeof sendAmount == 'number'){
        sendAmount = sendAmount.toString()
    }
    var txData =   {
        from: sender.publicKey,
        to: receiver,
        value: web3.utils.toWei(sendAmount, 'ether'),
        gas: '21000',
     }
     if (sender.privateKey == undefined){
        return undefined
     }
    var signedTx = await web3.eth.accounts.signTransaction(
        txData,
        sender.privateKey
     );
    console.log(signedTx.rawTransaction)
     return signedTx.rawTransaction
}

var add1 = {
    publicKey: '0x08129422279465A3754260eaB46C970616a88Eb6',
    privateKey: '0x2edf843088b1a2e58160d4ba3af1ac1301018bae17ef43e82596e66f69d76ee2'
  }

  var add2 = {
    publicKey: '0x0D11B2D5a9CD324cd83eDc5c4803209233A1CF77',
    privateKey: '0xb5506a485ef15fc2f94a15326ab210dd8d401bba94e0f63367af5c435bca8c47'
  }

createTransaction(add1, add2.publicKey, .005)