interface Transaction{
    Id: string,
    URL: string,
    Vendor: string,
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