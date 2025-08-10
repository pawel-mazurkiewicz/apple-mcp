import { runAppleScript } from 'run-applescript';

// Configuration
const CONFIG = {
    // Maximum contacts to process (to avoid performance issues)
    MAX_CONTACTS: 100,
    // Timeout for operations
    TIMEOUT_MS: 5000
};

async function checkContactsAccess(): Promise<boolean> {
    try {
        // Simple test to check Contacts access
        const script = `
tell application "Contacts"
    return name
end tell`;
        
        await runAppleScript(script);
        return true;
    } catch (error) {
        console.error(`Cannot access Contacts app: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

async function getAllNumbers(): Promise<{ [key: string]: string[] }> {
    try {
        if (!await checkContactsAccess()) {
            return {};
        }

        const script = `
tell application "Contacts"
    set contactList to {}
    set contactCount to 0
    
    -- Get a limited number of people to avoid performance issues
    set allPeople to people
    
    repeat with i from 1 to (count of allPeople)
        if contactCount >= ${CONFIG.MAX_CONTACTS} then exit repeat
        
        try
            set currentPerson to item i of allPeople
            set personName to name of currentPerson
            set personPhones to {}
            
            try
                set phonesList to phones of currentPerson
                repeat with phoneItem in phonesList
                    try
                        set phoneValue to value of phoneItem
                        if phoneValue is not "" then
                            set personPhones to personPhones & {phoneValue}
                        end if
                    on error
                        -- Skip problematic phone entries
                    end try
                end repeat
            on error
                -- Skip if no phones or phones can't be accessed
            end try
            
            -- Only add contact if they have phones
            if (count of personPhones) > 0 then
                set contactInfo to {name:personName, phones:personPhones}
                set contactList to contactList & {contactInfo}
                set contactCount to contactCount + 1
            end if
        on error
            -- Skip problematic contacts
        end try
    end repeat
    
    return contactList
end tell`;

        const result = await runAppleScript(script) as any;
        
        // Convert AppleScript result to our format
        const resultArray = Array.isArray(result) ? result : (result ? [result] : []);
        const phoneNumbers: { [key: string]: string[] } = {};
        
        for (const contact of resultArray) {
            if (contact && contact.name && contact.phones) {
                phoneNumbers[contact.name] = Array.isArray(contact.phones) ? contact.phones : [contact.phones];
            }
        }
        
        return phoneNumbers;
    } catch (error) {
        console.error(`Error getting all contacts: ${error instanceof Error ? error.message : String(error)}`);
        return {};
    }
}

async function findNumber(name: string): Promise<string[]> {
    try {
        if (!await checkContactsAccess()) {
            return [];
        }

        if (!name || name.trim() === '') {
            return [];
        }

        const searchName = name.toLowerCase();
        
        const script = `
tell application "Contacts"
    set matchedPhones to {}
    set searchText to "${searchName}"
    
    -- Get a limited number of people to search through
    set allPeople to people
    
    repeat with i from 1 to (count of allPeople)
        if i > ${CONFIG.MAX_CONTACTS} then exit repeat
        
        try
            set currentPerson to item i of allPeople
            set personName to name of currentPerson
            
            -- Simple case-insensitive name matching
            if personName contains searchText then
                try
                    set phonesList to phones of currentPerson
                    repeat with phoneItem in phonesList
                        try
                            set phoneValue to value of phoneItem
                            if phoneValue is not "" then
                                set matchedPhones to matchedPhones & {phoneValue}
                            end if
                        on error
                            -- Skip problematic phone entries
                        end try
                    end repeat
                on error
                    -- Skip if no phones
                end try
            end if
        on error
            -- Skip problematic contacts
        end try
    end repeat
    
    return matchedPhones
end tell`;

        const result = await runAppleScript(script) as any;
        const resultArray = Array.isArray(result) ? result : (result ? [result] : []);
        
        // If no direct matches found, try fuzzy matching with getAllNumbers
        if (resultArray.length === 0) {
            const allNumbers = await getAllNumbers();
            const closestMatch = Object.keys(allNumbers).find(personName => 
                personName.toLowerCase().includes(searchName)
            );
            return closestMatch ? allNumbers[closestMatch] : [];
        }
        
        return resultArray.filter(phone => phone && phone.trim() !== '');
    } catch (error) {
        console.error(`Error finding contact: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

async function findContactByPhone(phoneNumber: string): Promise<string | null> {
    try {
        if (!await checkContactsAccess()) {
            return null;
        }

        if (!phoneNumber || phoneNumber.trim() === '') {
            return null;
        }

        // Normalize the phone number for comparison
        const searchNumber = phoneNumber.replace(/[^0-9+]/g, '');
        
        const script = `
tell application "Contacts"
    set foundName to ""
    set searchPhone to "${searchNumber}"
    
    -- Get a limited number of people to search through
    set allPeople to people
    
    repeat with i from 1 to (count of allPeople)
        if i > ${CONFIG.MAX_CONTACTS} then exit repeat
        if foundName is not "" then exit repeat
        
        try
            set currentPerson to item i of allPeople
            
            try
                set phonesList to phones of currentPerson
                repeat with phoneItem in phonesList
                    try
                        set phoneValue to value of phoneItem
                        -- Normalize phone value for comparison
                        set normalizedPhone to phoneValue
                        
                        -- Simple phone matching
                        if normalizedPhone contains searchPhone or searchPhone contains normalizedPhone then
                            set foundName to name of currentPerson
                            exit repeat
                        end if
                    on error
                        -- Skip problematic phone entries
                    end try
                end repeat
            on error
                -- Skip if no phones
            end try
        on error
            -- Skip problematic contacts
        end try
    end repeat
    
    return foundName
end tell`;

        const result = await runAppleScript(script) as string;
        
        if (result && result.trim() !== '') {
            return result;
        }
        
        // Fallback to more comprehensive search using getAllNumbers
        const allContacts = await getAllNumbers();
        
        for (const [contactName, numbers] of Object.entries(allContacts)) {
            const normalizedNumbers = numbers.map(num => num.replace(/[^0-9+]/g, ''));
            if (normalizedNumbers.some(num => 
                num === searchNumber || 
                num === `+${searchNumber}` || 
                num === `+1${searchNumber}` ||
                `+1${num}` === searchNumber ||
                searchNumber.includes(num) ||
                num.includes(searchNumber)
            )) {
                return contactName;
            }
        }

        return null;
    } catch (error) {
        console.error(`Error finding contact by phone: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

export default { getAllNumbers, findNumber, findContactByPhone };