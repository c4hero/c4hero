workspace "mixed" {
  model {
    dev = person "Developer"
    sys = softwareSystem "System"
    
    paiIntent = element "pai" "Intention"
    
    dev -> paiIntent "reads"
    paiIntent -> sys "dictates"
  }
}
