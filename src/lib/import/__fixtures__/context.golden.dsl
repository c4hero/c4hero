workspace "System Context diagram for Internet Banking System" {

    model {
        properties {
            "structurizr.groupSeparator" "/"
        }

        group "BankBoundary0" {
            group "BankBoundary" {
                group "BankBoundary2" {
                    SystemA = softwareSystem "Banking System A"
                    SystemB = softwareSystem "Banking System B" "A system of the bank, with personal bank accounts. next line."
                }

                group "BankBoundary3" {
                    SystemF = softwareSystem "Banking System F Queue" "A system of the bank." "Queue"
                    SystemG = softwareSystem "Banking System G Queue" "A system of the bank, with personal bank accounts." "Queue,External"
                }

                SystemE = softwareSystem "Mainframe Banking System" "Stores all of the core banking information about customers, accounts, transactions, etc." "Database,External"
                SystemC = softwareSystem "E-mail system" "The internal Microsoft Exchange e-mail system." "External"
                SystemD = softwareSystem "Banking System D Database" "A system of the bank, with personal bank accounts." "Database"
            }

            customerA = person "Banking Customer A" "A customer of the bank, with personal bank accounts."
            customerB = person "Banking Customer B"
            customerC = person "Banking Customer C" "desc" "External"
            customerD = person "Banking Customer D" "A customer of the bank, <br/> with personal bank accounts."
            SystemAA = softwareSystem "Internet Banking System" "Allows customers to view information about their bank accounts, and make payments."
        }

        customerA -> SystemAA "Uses"
        SystemAA -> customerA "Uses"
        SystemAA -> SystemE "Uses"
        SystemE -> SystemAA "Uses"
        SystemAA -> SystemC "Sends e-mails" "SMTP"
        SystemC -> customerA "Sends e-mails to"
    }

    views {
        styles {
            element "Database" {
                shape Cylinder
            }

            element "Queue" {
                shape Pipe
            }
        }
    }

}
