workspace "custom-views" {
  model {
    paiIntent = element "pai" "Intention"
    paiPlan = element "pai plan" "Plan"
    
    paiIntent -> paiPlan "codified by"
  }
  
  views {
    custom "flow-map" "Flow map" {
      title "Flow"
      include *
      autolayout lr
    }
  }
}
