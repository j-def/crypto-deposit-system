import * as crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import * as utils from './utils'

interface Transaction{
    Id: string,
    URL: string,
    Vendor: string,
    Chains: string[],
    Items: ReceiptItem[],
    SuccessCallbackURL: string,
    FailureCallbackURL: string,
    Status: string
}
interface ReceiptItem{
    Name: string,
    Price: number,
    Description: string,
    ItemId: string
}
interface VendorOptions{
    AcceptedChains: string[],
    AcceptedContracts: string[]
}
interface SmartContractConnection{
    Chain: string,
    Address: string
}
interface ItemData{
    name: string,
    description: string,
    price: number,
    denomination: string
    itemId?: string,
}

/*
Transaction Endpoint

POST - /transaction - Creates a new transaction
GET - /transaction/{txid} - Gets a transactions data
DELETE - /transaction/{txid} - Cancels a transaction
*/

const postTransaction = (vendor: string, itemIds: string[], successCallback: string, failureCallback: string) => {
    let txid = crypto.randomBytes(14).toString('hex')
    let url = "https://www.example.com/checkout/"+txid.slice(0, 14)

    let vendorJsonBuffer = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorData = JSON.parse(vendorJsonBuffer.toString())
    let itemData = itemIds.map((val) => (
        vendorData[vendor].items[val]
    ))
    let chains = vendorData[vendor].acceptedChains

    let txDataStr = fs.readFileSync(path.join(__dirname, 'transactionData.json'))
    let txDataJson = JSON.parse(txDataStr.toString())

    while (Object.keys(txDataJson).includes(txid)){
        txid = crypto.randomBytes(14).toString('hex')
        url = "https://www.example.com/checkout/"+txid.slice(0, 14)
    }
    let txData: Transaction = {Id: txid, URL: url, Vendor: vendor, Chains: chains, Items: itemData, SuccessCallbackURL: successCallback, FailureCallbackURL: failureCallback, Status: "Unpaid"}
    txDataJson[txid] = txData

    fs.writeFileSync(path.join(__dirname, 'transactionData.json'), JSON.stringify(txDataJson));
    return txData
}

const deleteTransaction = (vendor: string, txid: string) => {
    let txDataStr = fs.readFileSync(path.join(__dirname, 'transactionData.json'))
    let txDataJson = JSON.parse(txDataStr.toString())

    if (!Object.keys(txDataJson).includes(txid) || txDataJson[txid].Status.toLowerCase() == "paid"){
        return false
    }

    let txArchinvedDataStr = fs.readFileSync(path.join(__dirname, 'archivedTransactions.json'))
    let txArchinvedDataJson = JSON.parse(txArchinvedDataStr.toString())

    txArchinvedDataJson[txid] = txDataJson[txid]
    delete txDataJson[txid]
    fs.writeFileSync(path.join(__dirname, 'archivedTransactions.json'), JSON.stringify(txArchinvedDataJson));
    fs.writeFileSync(path.join(__dirname, 'transactionData.json'), JSON.stringify(txDataJson));
    return true
}

const getTransaction = (txid: string) => {
    let txDataStr = fs.readFileSync(path.join(__dirname, 'transactionData.json'))
    let txDataJson = JSON.parse(txDataStr.toString())
    return txDataJson[txid]
}

/*
Menu Endpoint

GET - /menu - Retreives the menu items
POST - /menu - Adds a new menu item
PUT - /menu - Replaces menu

PATCH - /menu/{itemid} - Updates a menu item
DELETE - /menu/{itemid} - Deletes a menu item
*/

const getMenu = (vendorid: string) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())

    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    return Object.values(vendorDataJson[vendorid].items)
}

const postMenu = (vendorid: string, newItem: ItemData) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    let itemid = crypto.randomBytes(7).toString('hex')
    while (Object.keys(vendorDataJson[vendorid].items).includes(itemid)){
        itemid = crypto.randomBytes(7).toString('hex')
    }
    newItem.itemId = itemid
    vendorDataJson[vendorid].items[itemid] = newItem
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

const putMenu = (vendorid: string, newItems: ItemData[]) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    newItems.forEach((item) => {
        item.itemId = crypto.randomBytes(7).toString('hex')
    })
    let itemIdList = newItems.map((item) => (
        item.itemId
    ))
    itemIdList.forEach((elem, idx, arr) => {
        while (!utils.isUniqueItem(arr, elem)){
            newItems[idx].itemId = crypto.randomBytes(7).toString('hex')
        }
    })
    vendorDataJson[vendorid].items = newItems
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

interface PatchMenuItemUpdate{
    setKey: string,
    setValue: string | number
}

const patchMenuItem = (vendorid: string, itemId: string, update: PatchMenuItemUpdate) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid) || !Object.keys(vendorDataJson[vendorid].items).includes(itemId)){
        return false
    }
    vendorDataJson[vendorid].items[itemId][update.setKey] = update.setValue

    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

const deleteMenuItem = (vendorid: string, itemId: string) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid) || !Object.keys(vendorDataJson[vendorid].items).includes(itemId)){
        return false
    }
    delete vendorDataJson[vendorid].items[itemId]
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

/*
Accepted Chains Endpoint

GET - /accaptedchains - Retreives the accepted chains
POST - /accaptedchains - Adds an accepted chain
PUT - /accaptedchains - Replaces accepted chains
DELETE - /accaptedchains - Deletes an accepted chain
*/

const getAcceptedChains = (vendorid: string) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    return vendorDataJson[vendorid].acceptedChains
}

const postAcceptedChains = (vendorid: string, newChain: string) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    if (utils.countItems(vendorDataJson[vendorid].acceptedChains, newChain) == 0){
        vendorDataJson[vendorid].acceptedChains.push(newChain)
    }
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

const putAcceptedChains = (vendorid: string, newChains: string[]) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    vendorDataJson[vendorid].acceptedChains = newChains
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

const deleteAcceptedChains = (vendorid: string, oldChain: string) => {
    let vendorDataStr = fs.readFileSync(path.join(__dirname, 'vendorData.json'))
    let vendorDataJson = JSON.parse(vendorDataStr.toString())
    if (!Object.keys(vendorDataJson).includes(vendorid)){
        return false
    }
    if (utils.countItems(vendorDataJson[vendorid].acceptedChains, oldChain) !== 0){
        delete vendorDataJson[vendorid].acceptedChains[oldChain]
    }
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
    return true
}

/*
Balances Endpoint

GET - /balance - Retreives the balance from all chains
PUT - /balance - Update all balances in all chains

GET - /balance/{chain} - Retreives balance from all chain addresses
PUT - /balance/{chain} - Updates the blanace of all addresses in the chain

GET - /balance/{chain}/{address} - Retreives balance from specific address
PUT - /balance/{chain}/{address} - Updates a specific address balance
*/

const getBalance = (vendorid: string) => {
    
}