workspace "dy-flow flow-knowledge" {
  model {
    paiIntent = element "pai = OS-runnable cmd" "Intention" "Intention,Locked" "User mandate verbatim: pai is the RUNABLE cmd by itself IN THE OS" {
      properties {
        source "flow/intentions/2026-09-04_ai-launcher-preserved-pai-wrap.md"
        date "2026-09-04"
        status "locked"
      }
      url "https://github.com/buihongduc132/dy-flow/blob/main/flow/intentions/2026-09-04_ai-launcher-preserved-pai-wrap.md"
    }
    
    paiPlan = element "pai-wb-native-sl-loop" "Plan" "Plan,Active" "Declarative items 1-9" {
      properties {
        source "flow/plans/pai-wb-native-sl-loop.md"
        items "9"
        done "3"
        status "active"
      }
    }
    
    paiIntent -> paiPlan "codified by"
  }
}
