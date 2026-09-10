workspace "Container diagram for Internet Banking System" {

    model {
        customer = person "Personal Banking Customer" "A customer of the bank, with personal bank accounts."
        email_system = softwareSystem "E-Mail System" "The internal Microsoft Exchange system." "External"
        banking_system = softwareSystem "Mainframe Banking System" "Stores all of the core banking information about customers, accounts, transactions, etc." "External"
        c1 = softwareSystem "Internet Banking" {
            web_app = container "Web Application" "Delivers the static content and the Internet banking SPA" "Java, Spring MVC"
            spa = container "Single-Page App" "Provides all the Internet banking functionality to customers via their web browser" "JavaScript, Angular"
            mobile_app = container "Mobile App" "Provides a limited subset of the Internet banking functionality to customers via their mobile device" "C#, Xamarin"
            database = container "Database" "Stores user registration information, hashed auth credentials, access logs, etc." "SQL Database" "Database"
            backend_api = container "API Application" "Provides Internet banking functionality via API" "Java, Docker Container"
        }

        customer -> web_app "Uses" "HTTPS"
        customer -> spa "Uses" "HTTPS"
        customer -> mobile_app "Uses"
        web_app -> spa "Delivers"
        spa -> backend_api "Uses" "async, JSON/HTTPS"
        mobile_app -> backend_api "Uses" "async, JSON/HTTPS"
        database -> backend_api "Reads from and writes to" "sync, JDBC"
        customer -> email_system "Sends e-mails to"
        email_system -> backend_api "Sends e-mails using" "sync, SMTP"
        backend_api -> banking_system "Uses" "sync/async, XML/HTTPS"
    }

    views {
        styles {
            element "Database" {
                shape Cylinder
            }
        }
    }

}
