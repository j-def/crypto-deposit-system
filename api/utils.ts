import path from 'path'
import fs from 'fs'

export const isUniqueItem = (array: any[], item: any): Boolean => {
    for (var elem of array){
        if (elem === item){
            return false
        }
    }
    return true
}

export const countItems = (array: any[], item: any): number => {
    var itemCount = 0
    for (var elem of array){
        if (elem === item){
            itemCount++
        }
    }
    return itemCount
}
