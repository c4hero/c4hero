// Fictional architecture for C4Zoom navigation exploration.
workspace "Northstar Commerce" "Large fictional commerce architecture for semantic zoom" {
    model {
        customer = person "Customer" "Browses products and places orders"
        operator = person "Operations Specialist" "Manages fulfillment and customer cases"
        bank = softwareSystem "Payment Provider" "External payment processor" "External"
        carrier = softwareSystem "Shipping Carrier" "External parcel delivery service" "External"
        email = softwareSystem "Email Provider" "External email delivery service" "External"

        storefront = softwareSystem "Storefront" "Shopping experience" {
            storefrontApi = container "Storefront API" "Shopping experience" "Kotlin / Spring Boot" {
                storefrontC0 = component "Page Renderer" "Page Renderer within Storefront" "Kotlin"
                storefrontC1 = component "Session Manager" "Session Manager within Storefront" "Kotlin"
                storefrontC2 = component "Basket Manager" "Basket Manager within Storefront" "Kotlin"
            }
            storefrontWorker = container "Storefront Worker" "Processes background work for Storefront" "Kotlin" {
                storefrontConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                storefrontHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            storefrontDb = container "Storefront Database" "Persistent data owned by Storefront" "PostgreSQL" "Database"
            storefrontQueue = container "Storefront Queue" "Durable background work for Storefront" "RabbitMQ" "Queue"
            web = container "Web Application" "Customer shopping interface" "TypeScript / React"
        }

        identity = softwareSystem "Identity" "Customer accounts and authentication" {
            identityApi = container "Identity API" "Customer accounts and authentication" "Kotlin / Spring Boot" {
                identityC0 = component "Login Controller" "Login Controller within Identity" "Kotlin"
                identityC1 = component "Token Issuer" "Token Issuer within Identity" "Kotlin"
                identityC2 = component "Account Repository" "Account Repository within Identity" "Kotlin"
            }
            identityWorker = container "Identity Worker" "Processes background work for Identity" "Kotlin" {
                identityConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                identityHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            identityDb = container "Identity Database" "Persistent data owned by Identity" "PostgreSQL" "Database"
            identityQueue = container "Identity Queue" "Durable background work for Identity" "RabbitMQ" "Queue"
        }

        catalog = softwareSystem "Catalog" "Product information and discovery" {
            catalogApi = container "Catalog API" "Product information and discovery" "Kotlin / Spring Boot" {
                catalogC0 = component "Product Controller" "Product Controller within Catalog" "Kotlin"
                catalogC1 = component "Search Service" "Search Service within Catalog" "Kotlin"
                catalogC2 = component "Product Repository" "Product Repository within Catalog" "Kotlin"
            }
            catalogWorker = container "Catalog Worker" "Processes background work for Catalog" "Kotlin" {
                catalogConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                catalogHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            catalogDb = container "Catalog Database" "Persistent data owned by Catalog" "PostgreSQL" "Database"
            catalogQueue = container "Catalog Queue" "Durable background work for Catalog" "RabbitMQ" "Queue"
        }

        pricing = softwareSystem "Pricing" "Prices and promotions" {
            pricingApi = container "Pricing API" "Prices and promotions" "Kotlin / Spring Boot" {
                pricingC0 = component "Quote Controller" "Quote Controller within Pricing" "Kotlin"
                pricingC1 = component "Promotion Engine" "Promotion Engine within Pricing" "Kotlin"
                pricingC2 = component "Price Repository" "Price Repository within Pricing" "Kotlin"
            }
            pricingWorker = container "Pricing Worker" "Processes background work for Pricing" "Kotlin" {
                pricingConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                pricingHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            pricingDb = container "Pricing Database" "Persistent data owned by Pricing" "PostgreSQL" "Database"
            pricingQueue = container "Pricing Queue" "Durable background work for Pricing" "RabbitMQ" "Queue"
        }

        orders = softwareSystem "Orders" "Order lifecycle" {
            ordersApi = container "Orders API" "Order lifecycle" "Kotlin / Spring Boot" {
                ordersC0 = component "Order Controller" "Order Controller within Orders" "Kotlin"
                ordersC1 = component "Checkout Coordinator" "Checkout Coordinator within Orders" "Kotlin"
                ordersC2 = component "Order Repository" "Order Repository within Orders" "Kotlin"
            }
            ordersWorker = container "Orders Worker" "Processes background work for Orders" "Kotlin" {
                ordersConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                ordersHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            ordersDb = container "Orders Database" "Persistent data owned by Orders" "PostgreSQL" "Database"
            ordersQueue = container "Orders Queue" "Durable background work for Orders" "RabbitMQ" "Queue"
        }

        payments = softwareSystem "Payments" "Payment authorization and refunds" {
            paymentsApi = container "Payments API" "Payment authorization and refunds" "Kotlin / Spring Boot" {
                paymentsC0 = component "Payment Controller" "Payment Controller within Payments" "Kotlin"
                paymentsC1 = component "Authorization Service" "Authorization Service within Payments" "Kotlin"
                paymentsC2 = component "Payment Repository" "Payment Repository within Payments" "Kotlin"
            }
            paymentsWorker = container "Payments Worker" "Processes background work for Payments" "Kotlin" {
                paymentsConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                paymentsHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            paymentsDb = container "Payments Database" "Persistent data owned by Payments" "PostgreSQL" "Database"
            paymentsQueue = container "Payments Queue" "Durable background work for Payments" "RabbitMQ" "Queue"
        }

        inventory = softwareSystem "Inventory" "Stock availability and reservations" {
            inventoryApi = container "Inventory API" "Stock availability and reservations" "Kotlin / Spring Boot" {
                inventoryC0 = component "Stock Controller" "Stock Controller within Inventory" "Kotlin"
                inventoryC1 = component "Reservation Service" "Reservation Service within Inventory" "Kotlin"
                inventoryC2 = component "Stock Repository" "Stock Repository within Inventory" "Kotlin"
            }
            inventoryWorker = container "Inventory Worker" "Processes background work for Inventory" "Kotlin" {
                inventoryConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                inventoryHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            inventoryDb = container "Inventory Database" "Persistent data owned by Inventory" "PostgreSQL" "Database"
            inventoryQueue = container "Inventory Queue" "Durable background work for Inventory" "RabbitMQ" "Queue"
        }

        fulfillment = softwareSystem "Fulfillment" "Picking packing and shipping" {
            fulfillmentApi = container "Fulfillment API" "Picking packing and shipping" "Kotlin / Spring Boot" {
                fulfillmentC0 = component "Shipment Controller" "Shipment Controller within Fulfillment" "Kotlin"
                fulfillmentC1 = component "Dispatch Planner" "Dispatch Planner within Fulfillment" "Kotlin"
                fulfillmentC2 = component "Shipment Repository" "Shipment Repository within Fulfillment" "Kotlin"
            }
            fulfillmentWorker = container "Fulfillment Worker" "Processes background work for Fulfillment" "Kotlin" {
                fulfillmentConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                fulfillmentHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            fulfillmentDb = container "Fulfillment Database" "Persistent data owned by Fulfillment" "PostgreSQL" "Database"
            fulfillmentQueue = container "Fulfillment Queue" "Durable background work for Fulfillment" "RabbitMQ" "Queue"
        }

        notifications = softwareSystem "Notifications" "Customer messaging" {
            notificationsApi = container "Notifications API" "Customer messaging" "Kotlin / Spring Boot" {
                notificationsC0 = component "Message Controller" "Message Controller within Notifications" "Kotlin"
                notificationsC1 = component "Template Renderer" "Template Renderer within Notifications" "Kotlin"
                notificationsC2 = component "Preference Repository" "Preference Repository within Notifications" "Kotlin"
            }
            notificationsWorker = container "Notifications Worker" "Processes background work for Notifications" "Kotlin" {
                notificationsConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                notificationsHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            notificationsDb = container "Notifications Database" "Persistent data owned by Notifications" "PostgreSQL" "Database"
            notificationsQueue = container "Notifications Queue" "Durable background work for Notifications" "RabbitMQ" "Queue"
        }

        returns = softwareSystem "Returns" "Returns and refund coordination" {
            returnsApi = container "Returns API" "Returns and refund coordination" "Kotlin / Spring Boot" {
                returnsC0 = component "Return Controller" "Return Controller within Returns" "Kotlin"
                returnsC1 = component "Eligibility Policy" "Eligibility Policy within Returns" "Kotlin"
                returnsC2 = component "Return Repository" "Return Repository within Returns" "Kotlin"
            }
            returnsWorker = container "Returns Worker" "Processes background work for Returns" "Kotlin" {
                returnsConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                returnsHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            returnsDb = container "Returns Database" "Persistent data owned by Returns" "PostgreSQL" "Database"
            returnsQueue = container "Returns Queue" "Durable background work for Returns" "RabbitMQ" "Queue"
        }

        support = softwareSystem "Customer Support" "Customer case management" {
            supportApi = container "Customer Support API" "Customer case management" "Kotlin / Spring Boot" {
                supportC0 = component "Case Controller" "Case Controller within Customer Support" "Kotlin"
                supportC1 = component "Case Router" "Case Router within Customer Support" "Kotlin"
                supportC2 = component "Case Repository" "Case Repository within Customer Support" "Kotlin"
            }
            supportWorker = container "Customer Support Worker" "Processes background work for Customer Support" "Kotlin" {
                supportConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                supportHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            supportDb = container "Customer Support Database" "Persistent data owned by Customer Support" "PostgreSQL" "Database"
            supportQueue = container "Customer Support Queue" "Durable background work for Customer Support" "RabbitMQ" "Queue"
        }

        analytics = softwareSystem "Analytics" "Business reporting" {
            analyticsApi = container "Analytics API" "Business reporting" "Kotlin / Spring Boot" {
                analyticsC0 = component "Report Controller" "Report Controller within Analytics" "Kotlin"
                analyticsC1 = component "Query Planner" "Query Planner within Analytics" "Kotlin"
                analyticsC2 = component "Metric Repository" "Metric Repository within Analytics" "Kotlin"
            }
            analyticsWorker = container "Analytics Worker" "Processes background work for Analytics" "Kotlin" {
                analyticsConsumer = component "Event Consumer" "Receives queued work" "Kotlin"
                analyticsHandler = component "Job Handler" "Executes background work" "Kotlin"
            }
            analyticsDb = container "Analytics Database" "Persistent data owned by Analytics" "PostgreSQL" "Database"
            analyticsQueue = container "Analytics Queue" "Durable background work for Analytics" "RabbitMQ" "Queue"
        }

        // Relationships declared after all elements so references resolve.
        customer -> web "Shops" "HTTPS"
        web -> storefrontApi "Loads shopping experience" "HTTPS/JSON"
        operator -> fulfillmentApi "Manages shipments" "HTTPS/JSON"
        operator -> supportApi "Manages cases" "HTTPS/JSON"
        storefrontC0 -> storefrontC1 "Delegates" "In-process"
        storefrontC1 -> storefrontC2 "Loads and stores domain data" "In-process"
        storefrontC2 -> storefrontDb "Reads and writes" "SQL"
        storefrontC1 -> storefrontQueue "Enqueues background work" "AMQP"
        storefrontConsumer -> storefrontQueue "Consumes work" "AMQP"
        storefrontConsumer -> storefrontHandler "Dispatches" "In-process"
        storefrontHandler -> storefrontDb "Updates" "SQL"
        identityC0 -> identityC1 "Delegates" "In-process"
        identityC1 -> identityC2 "Loads and stores domain data" "In-process"
        identityC2 -> identityDb "Reads and writes" "SQL"
        identityC1 -> identityQueue "Enqueues background work" "AMQP"
        identityConsumer -> identityQueue "Consumes work" "AMQP"
        identityConsumer -> identityHandler "Dispatches" "In-process"
        identityHandler -> identityDb "Updates" "SQL"
        catalogC0 -> catalogC1 "Delegates" "In-process"
        catalogC1 -> catalogC2 "Loads and stores domain data" "In-process"
        catalogC2 -> catalogDb "Reads and writes" "SQL"
        catalogC1 -> catalogQueue "Enqueues background work" "AMQP"
        catalogConsumer -> catalogQueue "Consumes work" "AMQP"
        catalogConsumer -> catalogHandler "Dispatches" "In-process"
        catalogHandler -> catalogDb "Updates" "SQL"
        pricingC0 -> pricingC1 "Delegates" "In-process"
        pricingC1 -> pricingC2 "Loads and stores domain data" "In-process"
        pricingC2 -> pricingDb "Reads and writes" "SQL"
        pricingC1 -> pricingQueue "Enqueues background work" "AMQP"
        pricingConsumer -> pricingQueue "Consumes work" "AMQP"
        pricingConsumer -> pricingHandler "Dispatches" "In-process"
        pricingHandler -> pricingDb "Updates" "SQL"
        ordersC0 -> ordersC1 "Delegates" "In-process"
        ordersC1 -> ordersC2 "Loads and stores domain data" "In-process"
        ordersC2 -> ordersDb "Reads and writes" "SQL"
        ordersC1 -> ordersQueue "Enqueues background work" "AMQP"
        ordersConsumer -> ordersQueue "Consumes work" "AMQP"
        ordersConsumer -> ordersHandler "Dispatches" "In-process"
        ordersHandler -> ordersDb "Updates" "SQL"
        paymentsC0 -> paymentsC1 "Delegates" "In-process"
        paymentsC1 -> paymentsC2 "Loads and stores domain data" "In-process"
        paymentsC2 -> paymentsDb "Reads and writes" "SQL"
        paymentsC1 -> paymentsQueue "Enqueues background work" "AMQP"
        paymentsConsumer -> paymentsQueue "Consumes work" "AMQP"
        paymentsConsumer -> paymentsHandler "Dispatches" "In-process"
        paymentsHandler -> paymentsDb "Updates" "SQL"
        inventoryC0 -> inventoryC1 "Delegates" "In-process"
        inventoryC1 -> inventoryC2 "Loads and stores domain data" "In-process"
        inventoryC2 -> inventoryDb "Reads and writes" "SQL"
        inventoryC1 -> inventoryQueue "Enqueues background work" "AMQP"
        inventoryConsumer -> inventoryQueue "Consumes work" "AMQP"
        inventoryConsumer -> inventoryHandler "Dispatches" "In-process"
        inventoryHandler -> inventoryDb "Updates" "SQL"
        fulfillmentC0 -> fulfillmentC1 "Delegates" "In-process"
        fulfillmentC1 -> fulfillmentC2 "Loads and stores domain data" "In-process"
        fulfillmentC2 -> fulfillmentDb "Reads and writes" "SQL"
        fulfillmentC1 -> fulfillmentQueue "Enqueues background work" "AMQP"
        fulfillmentConsumer -> fulfillmentQueue "Consumes work" "AMQP"
        fulfillmentConsumer -> fulfillmentHandler "Dispatches" "In-process"
        fulfillmentHandler -> fulfillmentDb "Updates" "SQL"
        notificationsC0 -> notificationsC1 "Delegates" "In-process"
        notificationsC1 -> notificationsC2 "Loads and stores domain data" "In-process"
        notificationsC2 -> notificationsDb "Reads and writes" "SQL"
        notificationsC1 -> notificationsQueue "Enqueues background work" "AMQP"
        notificationsConsumer -> notificationsQueue "Consumes work" "AMQP"
        notificationsConsumer -> notificationsHandler "Dispatches" "In-process"
        notificationsHandler -> notificationsDb "Updates" "SQL"
        returnsC0 -> returnsC1 "Delegates" "In-process"
        returnsC1 -> returnsC2 "Loads and stores domain data" "In-process"
        returnsC2 -> returnsDb "Reads and writes" "SQL"
        returnsC1 -> returnsQueue "Enqueues background work" "AMQP"
        returnsConsumer -> returnsQueue "Consumes work" "AMQP"
        returnsConsumer -> returnsHandler "Dispatches" "In-process"
        returnsHandler -> returnsDb "Updates" "SQL"
        supportC0 -> supportC1 "Delegates" "In-process"
        supportC1 -> supportC2 "Loads and stores domain data" "In-process"
        supportC2 -> supportDb "Reads and writes" "SQL"
        supportC1 -> supportQueue "Enqueues background work" "AMQP"
        supportConsumer -> supportQueue "Consumes work" "AMQP"
        supportConsumer -> supportHandler "Dispatches" "In-process"
        supportHandler -> supportDb "Updates" "SQL"
        analyticsC0 -> analyticsC1 "Delegates" "In-process"
        analyticsC1 -> analyticsC2 "Loads and stores domain data" "In-process"
        analyticsC2 -> analyticsDb "Reads and writes" "SQL"
        analyticsC1 -> analyticsQueue "Enqueues background work" "AMQP"
        analyticsConsumer -> analyticsQueue "Consumes work" "AMQP"
        analyticsConsumer -> analyticsHandler "Dispatches" "In-process"
        analyticsHandler -> analyticsDb "Updates" "SQL"
        storefrontApi -> identityApi "Authenticates customers" "HTTPS/JSON"
        storefrontApi -> catalogApi "Browses products" "HTTPS/JSON"
        storefrontApi -> pricingApi "Gets prices" "HTTPS/JSON"
        storefrontApi -> ordersApi "Places orders" "HTTPS/JSON"
        ordersC1 -> pricingApi "Confirms quote" "HTTPS/JSON"
        ordersC1 -> inventoryApi "Reserves stock" "HTTPS/JSON"
        ordersC1 -> paymentsApi "Authorizes payment" "HTTPS/JSON"
        ordersHandler -> fulfillmentApi "Requests shipment" "HTTPS/JSON"
        ordersHandler -> notificationsApi "Sends confirmation" "HTTPS/JSON"
        paymentsC1 -> bank "Authorizes and refunds" "HTTPS/JSON"
        fulfillmentHandler -> carrier "Books delivery" "HTTPS/JSON"
        fulfillmentHandler -> inventoryApi "Confirms stock dispatch" "HTTPS/JSON"
        fulfillmentHandler -> notificationsApi "Sends shipping update" "HTTPS/JSON"
        notificationsHandler -> email "Delivers email" "HTTPS/JSON"
        returnsC1 -> ordersApi "Checks purchased items" "HTTPS/JSON"
        returnsHandler -> paymentsApi "Requests refund" "HTTPS/JSON"
        returnsHandler -> inventoryApi "Restocks accepted items" "HTTPS/JSON"
        supportApi -> ordersApi "Looks up orders" "HTTPS/JSON"
        supportApi -> returnsApi "Opens returns" "HTTPS/JSON"
        catalogApi -> inventoryApi "Checks availability" "HTTPS/JSON"
        pricingApi -> catalogApi "Reads product categories" "HTTPS/JSON"
        analyticsWorker -> ordersApi "Reads order metrics" "HTTPS/JSON"
        analyticsWorker -> paymentsApi "Reads payment metrics" "HTTPS/JSON"
        analyticsWorker -> fulfillmentApi "Reads delivery metrics" "HTTPS/JSON"
    }

    views {
        systemLandscape "Landscape" {
            include *
            autoLayout lr
        }
        systemContext storefront "storefrontContext" {
            include *
            autoLayout lr
        }
        container storefront "storefrontContainers" {
            include *
            autoLayout lr
        }
        component storefrontApi "storefrontApiComponents" {
            include *
            autoLayout lr
        }
        component storefrontWorker "storefrontWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext identity "identityContext" {
            include *
            autoLayout lr
        }
        container identity "identityContainers" {
            include *
            autoLayout lr
        }
        component identityApi "identityApiComponents" {
            include *
            autoLayout lr
        }
        component identityWorker "identityWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext catalog "catalogContext" {
            include *
            autoLayout lr
        }
        container catalog "catalogContainers" {
            include *
            autoLayout lr
        }
        component catalogApi "catalogApiComponents" {
            include *
            autoLayout lr
        }
        component catalogWorker "catalogWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext pricing "pricingContext" {
            include *
            autoLayout lr
        }
        container pricing "pricingContainers" {
            include *
            autoLayout lr
        }
        component pricingApi "pricingApiComponents" {
            include *
            autoLayout lr
        }
        component pricingWorker "pricingWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext orders "ordersContext" {
            include *
            autoLayout lr
        }
        container orders "ordersContainers" {
            include *
            autoLayout lr
        }
        component ordersApi "ordersApiComponents" {
            include *
            autoLayout lr
        }
        component ordersWorker "ordersWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext payments "paymentsContext" {
            include *
            autoLayout lr
        }
        container payments "paymentsContainers" {
            include *
            autoLayout lr
        }
        component paymentsApi "paymentsApiComponents" {
            include *
            autoLayout lr
        }
        component paymentsWorker "paymentsWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext inventory "inventoryContext" {
            include *
            autoLayout lr
        }
        container inventory "inventoryContainers" {
            include *
            autoLayout lr
        }
        component inventoryApi "inventoryApiComponents" {
            include *
            autoLayout lr
        }
        component inventoryWorker "inventoryWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext fulfillment "fulfillmentContext" {
            include *
            autoLayout lr
        }
        container fulfillment "fulfillmentContainers" {
            include *
            autoLayout lr
        }
        component fulfillmentApi "fulfillmentApiComponents" {
            include *
            autoLayout lr
        }
        component fulfillmentWorker "fulfillmentWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext notifications "notificationsContext" {
            include *
            autoLayout lr
        }
        container notifications "notificationsContainers" {
            include *
            autoLayout lr
        }
        component notificationsApi "notificationsApiComponents" {
            include *
            autoLayout lr
        }
        component notificationsWorker "notificationsWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext returns "returnsContext" {
            include *
            autoLayout lr
        }
        container returns "returnsContainers" {
            include *
            autoLayout lr
        }
        component returnsApi "returnsApiComponents" {
            include *
            autoLayout lr
        }
        component returnsWorker "returnsWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext support "supportContext" {
            include *
            autoLayout lr
        }
        container support "supportContainers" {
            include *
            autoLayout lr
        }
        component supportApi "supportApiComponents" {
            include *
            autoLayout lr
        }
        component supportWorker "supportWorkerComponents" {
            include *
            autoLayout lr
        }
        systemContext analytics "analyticsContext" {
            include *
            autoLayout lr
        }
        container analytics "analyticsContainers" {
            include *
            autoLayout lr
        }
        component analyticsApi "analyticsApiComponents" {
            include *
            autoLayout lr
        }
        component analyticsWorker "analyticsWorkerComponents" {
            include *
            autoLayout lr
        }
        styles {
            element "Software System" {
                background #334155
                color #ffffff
            }
            element "Container" {
                background #2563eb
                color #ffffff
            }
            element "Component" {
                background #bae6fd
                color #0f172a
            }
            element "Database" {
                shape Cylinder
            }
            element "Queue" {
                shape Pipe
            }
            element "External" {
                background #64748b
            }
            element "Person" {
                shape Person
            }
        }
    }
}
