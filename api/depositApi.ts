import * as crypto from 'crypto'
import fs from 'fs'
import path from 'path'

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

const generateTransaction = (vendor: string, itemIds: string[], successCallback: string, failureCallback: string) => {
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

const cancelTransaction = (vendor: string, txid: string) => {
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
    //verify each itemid, make sure it is unique
    vendorDataJson[vendorid].items = newItems
    fs.writeFileSync(path.join(__dirname, 'vendorData.json'), JSON.stringify(vendorDataJson));
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