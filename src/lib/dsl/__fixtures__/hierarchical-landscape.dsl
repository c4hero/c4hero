/*
 * Fixture: a large landscape written with hierarchical (dotted) identifiers.
 *
 * Structurally derived from a real IcePanel -> Structurizr DSL export
 * (55 software systems, 212 containers, 105 components, 6 people, 239
 * relationship statements, 16 component views); every name, description,
 * technology and tag has been mechanically replaced with a generic label.
 *
 * What it exercises:
 *   - `!identifiers hierarchical`
 *   - qualified relationship sources and destinations at two levels
 *     (`sys3.app48 -> sys1`) and three (`actor6 -> sys4.app55.part54`)
 *   - the same variable name declared in several scopes, which forces
 *     unique element ids
 *   - `component <system>.<container> "Key" "Name"` view scopes
 *   - dynamic views, groups, styles and themes around all of the above
 */

workspace "Label 1" "Label 2" {

    !identifiers hierarchical

    model {
        !impliedRelationships true

        # ---------------------------------------------------------------
        # note 2
        # ---------------------------------------------------------------
        group "Label 1" {
            actor1    = person "Label 3"
            actor2   = person "Label 4"
            actor3     = person "Label 5"
            actor4 = person "Label 6"
        }
        group "Label 7" {
            actor5 = person "Label 8" "Label 9"
        }
        group "Label 10" {
            actor6 = person "Label 11"
        }

        # ---------------------------------------------------------------
        # note 3
        # ---------------------------------------------------------------
        group "Label 1" {

            sys1 = softwareSystem "Label 12" "Label 13,Label 14,Label 15,Label 16,Label 17" "Label 18,Label 19,Label 20" {
                app1          = container "Label 21" "Label 22" "Label 23"
                app2           = container "Label 24" "" "Label 25"
                app3         = container "Label 26"
                app4     = container "Label 27" "Label 28"
                app5    = container "Label 29" "Label 30"
                app6   = container "Label 31" "Label 32"
                app7       = container "Label 33" "Label 34"
                app8   = container "Label 35" "Label 36"
                app9           = container "Label 37"
                app10         = container "Label 38"
                app11     = container "Label 39"
                app12        = container "Label 40" "Label 41"
                app13         = container "Label 42" "" "" "Label 43"
                app14     = container "Label 44"
                app15       = container "Label 45"
                app16    = container "Label 46" "" "Label 47" "Database"
                app17       = container "Label 48" "" "Label 48" "Database"
                app18               = container "Label 49" "" "Label 49" "Database"
                app19          = container "Label 50" "" "Label 51" "Database"
            }

            sys2 = softwareSystem "Label 52" "" "Label 53" {
                app20              = container "Label 52" "" "Label 54"
                app1           = container "Label 55" "Label 56" "Label 57" "Label 58"
                app21         = container "Label 59" "" "Label 57"
                app22        = container "Label 60" "Label 61" "Label 57"
                app23        = container "Label 62" "Label 63" "Label 57"
                app24              = container "Label 64" "" "Label 57"
                app25           = container "Label 65" "Label 66" "Label 57"
                app26        = container "Label 67" "" "Label 57"
                app27       = container "Label 68" "" "Label 57"
                app28     = container "Label 69" "" "Label 57"
                app29                = container "Label 70" "" "Label 71"
                app30 = container "Label 72" "" "Label 57"
                app31     = container "Label 73"
                app32       = container "Label 74"
                app33     = container "Label 75" "" "Label 54" "Future"
                app34        = container "Label 76" "Label 77" "Label 78" "Database"
                app35         = container "Label 79" "Label 80" "Label 78" "Database"
                app36                = container "Label 81" "" "Label 78" "Database"
                app37            = container "Label 82" "" "Label 83" "Database"
                app38      = container "Label 84" "" "Label 85" "Database"

                app39 = container "Label 86" "" "Label 54" "Label 87" {
                    part1      = component "Label 88"
                    part2 = component "Label 89"
                    part3       = component "Label 90"
                    part4    = component "Label 91"
                }

                app40 = container "Label 92" "" "Label 54" "Label 87" {
                    part5 = component "Label 93"
                    part6         = component "Label 94"
                    part7        = component "Label 95"
                    part8         = component "Label 96"
                }

                app41 = container "Label 97" "" "Label 25" "Future" {
                    part9 = component "Label 98"
                    part10    = component "Label 99"
                    part11          = component "Label 100"
                    part12     = component "Label 101"
                    part13         = component "Label 102" "Label 103"
                    part14     = component "Label 104" "Label 105,Label 106"
                }
            }

            sys3 = softwareSystem "Label 107" "" "Label 53" {
                app42 = container "Label 108" "" "Label 109" "Future"
                app43              = container "Label 110" "" "Label 25" "Future"
                app44               = container "Label 111" "" "Label 25" "Future"
                app45           = container "Label 112" "" "Label 25" "Future"
                app46                   = container "Label 113"
                app47          = container "Label 114"

                app48 = container "Label 115" "" "Label 54" {
                    part15 = component "Label 116"
                    part16   = component "Label 117"
                    part17      = component "Label 118"
                    app9       = component "Label 37"
                    part18 = component "Component"
                }

                app49 = container "Label 119" "" "Label 25" "Label 120" {
                    part19          = component "Label 121" "" "" "Label 58"
                    part20    = component "Label 122"
                    part21   = component "Label 123" "" "" "Label 58"
                    part22 = component "Label 124"
                    part23             = component "Label 125" "" "" "Label 58"
                    part24         = component "Label 126" "" "" "Label 58"
                    part25            = component "Label 127" "" "" "Label 58,Future"
                    part26 = component "Label 128"

                    part27             = component "Label 129" "" "" "Label 130"
                    part28      = component "Label 131" "" "" "Label 130"
                    part29                = component "Label 132" "" "" "Label 130"
                    part30             = component "Label 133" "" "" "Label 130"
                    part31               = component "Label 134" "" "" "Label 130,Future"
                    part32    = component "Label 135"

                    part33          = component "Label 136" "" "" "Label 137"
                    part34   = component "Label 138" "" "" "Label 137"
                    part35             = component "Label 139" "" "" "Label 137"
                    part36          = component "Label 140" "" "" "Label 137"
                    part37            = component "Label 141" "" "" "Label 137,Future"
                    part38 = component "Label 142"

                    part39      = component "Label 143" "" "" "Label 144"
                    part40      = component "Label 145" "" "" "Label 144"
                    part41       = component "Label 146" "" "" "Label 144"
                    part42 = component "Label 147" "" "" "Label 144"
                }

                app50 = container "Label 148" "" "Label 149" "Database" {
                    part43 = component "Label 150"
                }
            }

            sys4 = softwareSystem "Label 151" "Label 152" {
                app51   = container "Label 153" "" "Label 109"
                app52        = container "Label 154" "" "Label 85"
                app53 = container "Label 155" "" "" "Database"
                app54 = container "Label 156" "" "" "Database"

                app55 = container "Label 157" "" "Label 57" {
                    part44               = component "Label 158"
                    part45        = component "Label 159"
                    part46 = component "Label 160"
                    part47  = component "Label 161"
                    part48     = component "Label 162"
                    part49       = component "Label 163" "Label 164"
                    part50         = component "Label 165"
                    part51        = component "Label 166"
                    part52              = component "Label 167"
                    part53                  = component "Label 168"
                    part54                   = component "Label 169" "Label 170"
                    part55                 = component "Label 171"

                    part56                   = component "Label 172"
                    part57            = component "Label 173"
                    part58      = component "Label 174"
                    part59           = component "Label 175"
                    part60             = component "Label 176"
                    part61            = component "Label 177"
                    part62                     = component "Label 178"
                    part63                      = component "Label 179"

                    part64                = component "Label 180"
                    part65         = component "Label 181"
                    part66              = component "Label 182"
                    part67               = component "Label 183"
                    part68             = component "Label 184"
                    part69                = component "Label 185"
                    part70                         = component "Label 186"

                    part71     = component "Label 187"
                    part72 = component "Label 188"
                    part73 = component "Label 189"
                    part74           = component "Label 190"
                    part75                = component "Label 191"
                    part76               = component "Label 192"
                    part77                   = component "Label 193"
                    part78                    = component "Label 194"
                    part79             = component "Label 195"

                    part80                 = component "Label 196"
                    part81                  = component "Label 197"
                    part82              = component "Label 198"
                }

                app56 = container "Label 199" "" "Label 57" {
                    part83        = component "Label 200"
                    part84         = component "Label 201"
                    part85  = component "Label 202"
                    part86    = component "Label 203"
                    part87 = component "Label 204"
                    part88        = component "Label 205"
                    part89 = component "Label 206"
                }

                app57 = container "Label 207" "" "Label 149" "Database" {
                    part90  = component "Label 155" "" "Label 208"
                    part91  = component "Label 209" "" "Label 208"
                }
            }

            sys5 = softwareSystem "Label 210" "" "Label 18" {
                app13        = container "Label 211" "Label 212" "Label 23" "Label 43"
                app58  = container "Label 213" "" "Label 214"
                app59     = container "Label 215" "" "Label 23"
                app60        = container "Label 216" "" "Label 57" "Label 43"
                app61        = container "Label 217" "Label 218"
                app62  = container "Label 219" "" "Label 220"
                app63    = container "Label 221" "" "Label 109"
                app64 = container "Label 222" "" "Label 109"
                app65     = container "Label 223" "" "Label 109"
                app66       = container "Label 224" "" "Label 109"
                app67             = container "Label 225" "" "Label 226"
                app68             = container "Label 227" "Label 228" "Label 229"
                app69             = container "Label 230" "Label 231" "Label 230" "Label 232"
                app70                = container "Label 233"
                app71      = container "Label 234" "" "Label 235" "Database"
                app72        = container "Label 236" "" "Label 235" "Database"
                app73      = container "Label 237" "" "Label 238" "Database"
                app74          = container "Label 239" "" "" "Database"

                app75 = container "Label 240" "" "Label 23" {
                    part92 = component "Label 222"
                }

                app76 = container "Label 241" "Label 242" "Label 238" "Database" {
                    part93 = component "Label 243"
                }
            }

            sys6 = softwareSystem "Label 244" {
                app77            = container "Label 245" "" "Label 246"
                app78     = container "Label 247" "" "Label 57"
                app79   = container "Label 248" "" "Label 71"
                app80          = container "Label 249" "" "Label 246"
                app81     = container "Label 250" "" "Label 71"
                app82                    = container "Label 251" "" "Label 54"
                app83    = container "Label 252" "" "Label 57"
                app84       = container "Label 253"
                app85 = container "Label 254"
                app86              = container "Label 255" "" "Label 256"
                app87             = container "Label 113"
                app88          = container "Label 257" "" "Label 149" "Database"
                app89        = container "Label 258" "" "Label 149" "Database"
                app90  = container "Label 259" "" "Label 260" "Database"
                app91   = container "Label 261" "" "Label 235" "Database"
                app92           = container "Label 262" "" "" "Database"

                app93 = container "Label 263" "" "Label 149" "Database" {
                    part94 = component "Label 264"
                }
            }

            sys7 = softwareSystem "Label 265" {
                app94 = container "Label 266" "" "Label 57"
                app95      = container "Label 267" "" "Label 57"
                app96      = container "Label 268" "" "Label 57"
                app97   = container "Label 269"
                app98      = container "Label 270" "Label 271" "Label 57"
                app99      = container "Label 272" "" "Label 57"
                app100      = container "Label 273" "" "Label 57"
                app101        = container "Label 274" "" "Label 71"
                app102        = container "Label 275" "" "Label 109"
                app103    = container "Label 276" "" "Label 57"
                app104             = container "Label 277" "" "Label 54"
                app105             = container "Label 278" "" "Label 279"
                app106         = container "Label 280" "" "Label 214"
                app107               = container "Label 281" "" "Label 229" "Database"
                app108       = container "Label 282" "" "Label 283" "Database"
                app109  = container "Label 284" "" "Label 283" "Database"
            }

            sys8 = softwareSystem "Label 285" "" "Label 18,Label 87" {
                app110         = container "Label 285" "" "Label 54"
                app111 = container "Label 286"
                app112     = container "Label 287"
                app113        = container "Label 288" "" "Label 289" "Label 43"
                app114       = container "Label 290" "" "Label 289"
                app24           = container "Label 64" "" "Label 289"
                app115     = container "Label 291" "" "Label 289"
            }

            sys9 = softwareSystem "Label 292" "" "Label 53" {
                app116 = container "Label 293" "Label 294" "Label 289"
                app117           = container "Label 295" "Label 296" "Label 289"
                app118                  = container "Label 297" "Label 298,Label 299,Label 300"
                app119                    = container "Label 301" "Label 302"
                app39                  = container "Label 86" "Label 303" "Label 54"
                app120                   = container "Label 304" "Label 305" "Label 54"
                app121   = container "Label 306" "" "Label 109"
                app122                = container "Label 307"
                app123                    = container "Label 308" "" "Label 149" "Database"
            }

            sys10 = softwareSystem "Label 309" {
                app124         = container "Label 74"
                app125               = container "Label 310" "" "Label 57"
                app126                 = container "Label 311"
                app127             = container "Label 312"
                app128 = container "Label 313" "" "Label 57"
                app129           = container "Label 314" "" "Label 78" "Database"
            }

            sys11 = softwareSystem "Label 315" "" "Label 316" {
                app130          = container "Label 317" "Label 318" "" "Deprecated"
                app131 = container "Label 319"
                app132            = container "Label 320" "" "Label 54"
                app122      = container "Label 307"
                app133            = container "Label 321"
                app134                = container "Label 322" "" "" "Database"

                app135 = container "Label 323" "" "Label 23" {
                    part95          = component "Label 324"
                    part96    = component "Label 325"
                    part97     = component "Label 326"
                    part98       = component "Label 327"
                    part99 = component "Label 328"
                }
            }

            sys12 = softwareSystem "Label 329" "Label 330" "Label 53" {
                app136      = container "Label 331" "" "Label 109"
                app137   = container "Label 332"
                app87  = container "Label 113"
                app138 = container "Label 333" "Label 334" "Label 149" "Database"
                app123     = container "Label 308" "" "Label 149" "Database"

                app139 = container "Label 335" "" "Label 289" {
                    part100            = component "Label 336" "Label 337"
                    part101           = component "Label 338" "Label 339,Label 340,Label 341"
                    part102 = component "Label 342" "Label 343"
                }
            }

            sys13 = softwareSystem "Label 344" {
                app140   = container "Label 344"
                app141 = container "Label 345"
                app142        = container "Label 346"
                app143  = container "Label 347"
            }

            sys14 = softwareSystem "Label 348" "" "Label 53" {
                app144  = container "Label 349" "" "Label 57"
                app145 = container "Label 350"
                app146 = container "Label 351" "" "Label 352" "Database"
                app147    = container "Label 353" "" "Label 51" "Database"
            }

            sys15 = softwareSystem "Label 354" {
                app46             = container "Label 355"
                app148  = container "Label 356"
                app149          = container "Label 357" "" "Label 289"
                app150       = container "Label 358" "" "Label 289"
                app151        = container "Label 359"
                app114     = container "Label 290" "" "Label 57"
                app152  = container "Label 360" "Label 361" "Label 149" "Database"
            }

            sys16 = softwareSystem "Label 362" {
                app153     = container "Label 363"
                app154        = container "Label 364" "" "Label 54"
                app155 = container "Label 365"
            }

            sys17 = softwareSystem "Label 366" {
                app156               = container "Label 367"
                app157                 = container "Label 368,Label 369"
                app158 = container "Label 370"
                app74            = container "Label 239" "" "" "Database"
            }

            sys18 = softwareSystem "Label 371" {
                app159 = container "Label 372" "" "Label 57"
                app134      = container "Label 373" "" "Label 78" "Database"
            }

            sys19 = softwareSystem "Label 374" {
                app160           = container "Label 375"
                app161  = container "Label 376" "" "Label 25"
            }

            sys20 = softwareSystem "Label 377" {
                app46 = container "Label 378"
            }

            sys21 = softwareSystem "Label 379" {
                app162 = container "Label 380"
            }

            app118 = softwareSystem "Label 297" {
                app134 = container "Label 381" "" "" "Database"
            }

            sys22 = softwareSystem "Label 382" {
                app163 = container "Label 383" "" "Label 256"
            }

            sys23       = softwareSystem "Label 384"
            sys24  = softwareSystem "Label 385"
            sys25       = softwareSystem "Label 386" "" "Label 53"
            sys26       = softwareSystem "Label 387"
            sys27         = softwareSystem "Label 388"
            sys28 = softwareSystem "Label 389"
            sys29 = softwareSystem "Label 390"
            sys30  = softwareSystem "Label 391"
            sys31    = softwareSystem "Label 392"
            sys32       = softwareSystem "Label 393"
            sys33    = softwareSystem "Label 394"
            sys34        = softwareSystem "Label 395" "" "Label 395"
            sys35     = softwareSystem "Label 396"
            sys36     = softwareSystem "Label 397" "" "Label 397"
            sys37   = softwareSystem "Label 398" "" "Label 398"
            sys38   = softwareSystem "Label 399"
            sys39 = softwareSystem "Label 400"

            # note 4
            # note 5
            sys40      = softwareSystem "Label 401" "" "Group"
            sys41  = softwareSystem "Label 117" "" "Group"
            sys42 = softwareSystem "Label 402" "Label 403" "Group"
            sys43 = softwareSystem "Label 404" "" "Group"
            sys44 = softwareSystem "Label 405" "" "Group"
            sys45     = softwareSystem "Label 406" "" "Group"
            sys46       = softwareSystem "Label 407" "" "Group"
            sys47 = softwareSystem "Label 408" "" "Group"
            sys48   = softwareSystem "Label 409" "" "Group"
            sys49         = softwareSystem "Label 410" "" "Group"
            sys50 = softwareSystem "Label 411" "" "Group"
        }

        # ---------------------------------------------------------------
        # note 6
        # ---------------------------------------------------------------
        group "Label 7" {
            sys51 = softwareSystem "Label 412" {
                app164            = container "Label 413" "" "Label 54"
                app165         = container "Label 414" "" "Label 54"
                app166     = container "Label 415" "" "Label 25"
                app167 = container "Label 416" "" "Label 25"
                app168  = container "Label 417" "" "Label 25"
                app169 = container "Label 418" "" "Label 25"
                app170       = container "Label 419"
                app171      = container "Label 420" "" "Label 54" "Future"
                app172     = container "Label 421" "" "Label 54"
                app173       = container "Label 422" "" "Label 54" "Future"
                app174           = container "Label 423" "" "Label 54" "Future"
                app175           = container "Label 424" "" "Label 25" "Future"
                app176          = container "Label 425" "" "Label 25"
                app177     = container "Label 426" "" "Label 25"
                app178                  = container "Label 427" "" "Label 25"
                app179                 = container "Label 428" "" "Label 25" "Future"
                part29                = container "Label 132" "" "Label 25" "Future"
                app180           = container "Label 429" "" "Label 25" "Future"
                app181              = container "Label 430" "" "Label 25" "Future"
                app182            = container "Label 431" "" "Label 25" "Future"
                app183            = container "Label 432" "" "Label 25" "Future"
                app184     = container "Label 433" "" "Label 25" "Future"
                app87                  = container "Label 113"
                app185         = container "Label 434"

                app186          = container "Label 435" "" "Label 149" "Database"
                app187             = container "Label 436" "" "Label 149" "Database,Future"
                app188            = container "Label 437" "" "Label 235" "Database,Future"
                app189              = container "Label 438" "" "Label 149" "Database,Future"
                app190          = container "Label 439" "" "Label 149" "Database,Future"
                app191        = container "Label 440" "" "Label 149" "Database,Future"
                app192         = container "Label 441" "" "Label 149" "Database,Future"
                app193  = container "Label 442" "" "Label 149" "Database,Future"
                app194            = container "Label 443" "" "Label 238" "Database,Future"

                app195 = container "Label 444" "" "Label 54" "Future" {
                    part103 = component "Label 445"
                }
                app196 = container "Label 446" "" "Label 447" "Future" {
                    part103 = component "Label 445"
                }
            }
        }

        # ---------------------------------------------------------------
        # note 7
        # ---------------------------------------------------------------
        group "Label 448" {
            sys52 = softwareSystem "Label 449" {
                app197 = container "Label 450"
            }
            sys53 = softwareSystem "Label 451"
        }

        # ---------------------------------------------------------------
        # note 8
        # ---------------------------------------------------------------
        group "Label 374" {
            sys54 = softwareSystem "Label 452"
        }

        # ===============================================================
        # note 9
        # ===============================================================

        # note 10
        actor1 -> sys3.app48 "Label 453"
        actor1 -> sys3.app48 "Label 454"
        actor1 -> sys6.app82 "Label 455"
        actor1 -> sys2.app20 "Label 456"
        actor1 -> sys2.app20 "Label 457"
        actor1 -> sys20 "Label 458"
        actor2 -> sys2.app20 "Label 454"
        actor2 -> sys2.app20 "Label 456"
        actor3 -> sys8.app110 "Label 454"
        actor4 -> sys5.app69 "Label 459"
        actor5 -> sys4.app56 "Label 460"
        actor6 -> sys4.app55.part54 "Label 461"
        actor6 -> sys4.app55.part49 "Label 462"
        actor6 -> sys4.app55.part50 "Label 462"
        actor6 -> sys4.app55.part51 "Label 462"
        actor6 -> sys4.app55.part53 "Label 461"

        # note 11
        sys2 -> sys1 "Label 463"
        sys2 -> sys1 "Label 464"
        sys2 -> sys12 "Label 465" "Label 466"
        sys2 -> sys9 "Label 461"
        sys2 -> sys3 "Label 465" "Label 466"
        sys10 -> sys2 "Label 465" "Label 466"
        sys10 -> sys5 "Label 467"
        sys10 -> sys5 "Label 468"
        sys10 -> sys6 "Label 469"
        sys10 -> sys18 "Label 470"
        sys10 -> sys27 "Label 470"
        sys10 -> sys17 "Label 465" "Label 466"
        sys10 -> sys2.app1 "Label 471"
        sys8 -> sys2 "Label 472"
        sys8 -> sys1 "Label 473"
        sys8 -> sys1 "Label 474"
        sys8 -> sys1 "Label 465"
        sys8 -> sys23 "Label 465"
        sys8 -> sys23 "Label 475"
        sys8 -> sys3 "Label 472"
        sys8 -> sys3 "Label 476"
        sys23 -> sys1 "Label 477"
        sys23 -> sys8 "Label 465"
        sys1 -> sys5 "Label 478"
        sys1 -> sys5 "Label 479"
        sys1 -> sys23 "Label 465"
        sys1 -> sys24 "Label 480" "Label 481"
        sys1 -> app118 "Label 465"
        sys1 -> sys53 "Label 482"
        sys1 -> sys13.app140 "Label 483"
        # note 12
        # note 13
        # note 14
        sys12 -> sys1 "Label 465" "Label 466"
        sys25 -> sys12 "Label 465" "Label 466"
        sys25 -> sys1.app13 "Label 484"
        sys14 -> sys1 "Label 485"
        sys52 -> sys1 "Label 486"
        sys11 -> sys5 "Label 316"
        sys11 -> sys26 "Label 487"
        sys3 -> sys1 "Label 465"
        sys3 -> sys24 "Label 480"
        sys24 -> sys3 "Label 480"
        sys5 -> sys3 "Label 480"
        sys4 -> sys3 "Label 488"
        sys22 -> sys3 "Label 465" "Label 466"
        sys22 -> actor1 "Label 453"
        sys13.app140 -> sys1 "Label 489"
        sys13.app143 -> sys5 "Label 490"
        sys19 -> sys20 "Label 491"
        sys31 -> sys15 "Label 461"
        sys21 -> sys34 "Label 492"
        sys33 -> sys34 "Label 492"
        sys40 -> sys6.app80 "Label 493"
        sys40 -> sys6.app82 "Label 491"
        sys40 -> sys7.app94 "Label 494"

        # note 15
        sys1.app9 -> sys1.app13 "Label 478"
        sys1.app13 -> sys5.app58 "Label 495"
        sys1.app13 -> sys5.app68 "Label 496"
        sys1.app2 -> actor1 "Label 461"
        sys1.app2 -> sys6.app82 "Label 461"
        sys52.app197 -> sys1.app1 "Label 497"
        sys14.app146 -> sys1.app16 "Label 485"

        # note 16
        sys2.app1 -> sys4.app55 "Label 498"
        sys2.app1 -> sys2.app24 "Label 499"
        sys2.app1 -> sys2.app25 "Label 475"
        sys2.app1 -> sys2.app23 "Label 461"
        sys2.app24 -> sys2.app28 "Label 500"
        sys2.app25 -> sys2.app37 "Label 501"
        sys2.app22 -> sys2.app36 "Label 502"
        sys2.app23 -> sys2.app35 "Label 502"
        sys2.app26 -> sys2.app34 "Label 502"
        sys2.app26 -> sys2.app37 "Label 501"
        sys2.app26 -> sys2.app38 "Label 501"
        sys2.app21 -> sys1 "Label 503"
        sys2.app21 -> sys1.app2 "Label 504"
        sys2.app29 -> sys2.app1 "Label 505"
        sys2.app29 -> sys4.app55 "Label 506"
        sys2.app29 -> sys17.app156 "Label 507"
        sys2.app39 -> sys2.app1 "Label 462"
        sys2.app39 -> sys3.app49 "Label 508"
        sys2.app39 -> sys4.app55.part45 "Label 120"
        sys2.app40 -> sys2.app1 "Label 509"
        sys2.app40 -> sys4.app55 "Label 510"
        sys2.app32 -> sys2.app40 "Label 475"
        sys2.app20 -> sys6 "Label 511"
        sys2.app20 -> sys3.app48 "Label 453"
        sys2.app20 -> sys3.app48.part17 "Label 453"
        sys2.app20 -> sys3.app48.part15 "Label 512"
        sys2.app20 -> sys3.app49 "Label 513"
        sys2.app20 -> sys3.app49.part19 "Label 316"
        sys2.app20 -> sys5.app62 "Label 514"
        sys2.app33 -> sys2.app41 "Label 515"
        sys2.app33 -> sys2.app41.part9 "Label 461"
        sys2.app41 -> sys1.app2 "Label 516,Label 517,Label 518"
        sys6.app82 -> sys2.app33 "Label 491"

        # note 17
        sys3.app48 -> sys1 "Label 519"
        sys3.app48 -> sys1 "Label 316"
        sys3.app48 -> sys1.app13 "Label 520"
        sys3.app48 -> sys3.app49 "Label 521"
        sys3.app48 -> sys3.app49.part19 "Label 316"
        sys3.app48 -> sys3.app49.part21 "Label 316"
        sys3.app48 -> sys3.app49.part23 "Label 316"
        sys3.app48 -> sys3.app49.part24 "Label 316"
        sys3.app48 -> sys3.app49.part26 "Label 316"
        sys3.app48.app9 -> sys1 "Label 489"
        sys3.app48.part15 -> sys1 "Label 316"
        sys3.app48.part15 -> sys3.app49 "Label 522"
        sys3.app48.part15 -> sys3.app47 "Label 522"
        sys3.app48.part17 -> sys3.app48.part15 "Label 523"
        sys3.app49 -> sys3.app50 "Label 524" "Label 525"
        sys3.app49 -> sys1.app1 "Label 526"
        sys3.app49 -> sys5.app13 "Label 468"
        sys3.app49.part19 -> sys3.app49.part27 "Label 527"
        sys3.app49.part36 -> sys1 "Label 316"
        sys3.app43 -> sys3.app50 "Label 528"
        sys3.app44 -> sys3.app50 "Label 529"
        sys3.app42 -> sys3.app49 "Label 530"
        sys3.app42 -> sys3.app49.part25 "Label 522"
        sys3.app42 -> sys3.app49.part25 "Label 316"
        sys8.app110 -> sys3.app48 "Label 531"
        sys8.app110 -> sys3.app48.part15 "Label 532"
        sys22.app163 -> sys3.app48.part17 "Label 533"
        sys22.app163 -> sys3.app48.part17 "Label 453"

        # note 18
        sys4.app55 -> sys4.app57 "Label 534"
        sys4.app55 -> sys4.app54 "Label 535"
        sys4.app55 -> sys3.app49 "Label 536"
        sys4.app55 -> sys5.app13 "Label 537"
        sys4.app56 -> sys4.app52 "Label 538"
        sys4.app56 -> sys4.app57.part90 "Label 539"
        sys4.app51 -> sys4.app52 "Label 540"
        sys4.app51 -> sys4.app57 "Label 541"
        sys4.app51 -> sys1.app2 "Label 542"
        sys4.app56.part85 -> sys4.app56.part86 "Label 543"
        sys4.app56.part89 -> sys4.app56.part85 "Label 544"
        sys4.app56.part86 -> sys1.app2 "Label 545"
        sys4.app56.part88 -> sys1.app2 "Label 546"
        sys4.app56.part87 -> sys4.app57.part90 "Label 547"

        # note 19
        sys4.app55.part47 -> sys4.app55.part58 "Label 461"
        sys4.app55.part49 -> sys4.app55.part59 "Label 462"
        sys4.app55.part56 -> sys4.app55.part64 "Label 548"
        sys4.app55.part57 -> sys4.app55.part67 "Label 549"
        sys4.app55.part57 -> sys4.app55.part71 "Label 550"
        sys4.app55.part61 -> sys4.app55.part65 "Label 551"
        sys4.app55.part61 -> sys4.app55.part65 "Label 462"
        sys4.app55.part59 -> sys4.app55.part82 "Label 552"
        sys4.app55.part59 -> sys4.app55.part68 "Label 462"
        sys4.app55.part59 -> sys4.app55.part65 "Label 553"
        sys4.app55.part60 -> sys4.app55.part75 "Label 461"
        sys4.app55.part60 -> sys4.app55.part76 "Label 461"
        sys4.app55.part60 -> sys4.app55.part69 "Label 462"
        sys4.app55.part62 -> sys4.app55.part79 "Label 554"
        sys4.app55.part71 -> sys4.app55.part64 "Label 555"
        sys4.app55.part71 -> sys4.app55.part67 "Label 556"
        sys4.app55.part71 -> sys4.app55.part66 "Label 557"
        sys4.app55.part64 -> sys1.app2 "Label 558" "Label 120"
        sys4.app55.part65 -> sys4.app57 "Label 462"
        sys4.app55.part65 -> sys4.app55.part67 "Label 559"
        sys4.app55.part67 -> sys4.app57 "Label 462"
        sys4.app55.part68 -> sys4.app57 "Label 462"
        sys4.app55.part68 -> sys4.app55.part69 "Label 560"
        sys4.app55.part69 -> sys4.app57 "Label 462"
        sys4.app55.part69 -> sys4.app55.part65 "Label 561"
        sys4.app55.part70 -> sys4.app57 "Label 562"
        sys4.app55.part72 -> sys4.app55.part65 "Label 462"
        sys4.app55.part72 -> sys4.app55.part69 "Label 462"
        sys4.app55.part72 -> sys4.app55.part67 "Label 462"
        sys4.app55.part73 -> sys4.app55.part72 "Label 563"
        sys4.app55.part73 -> sys4.app55.part68 "Label 462"
        sys4.app55.part74 -> sys4.app55.part73 "Label 563"
        sys4.app55.part74 -> sys4.app55.part72 "Label 563"
        sys4.app55.part74 -> sys4.app55.part68 "Label 462"
        sys4.app55.part74 -> sys4.app55.part69 "Label 462"
        sys4.app55.part77 -> sys4.app55.part80 "Label 564"
        sys4.app55.part80 -> sys5.app13 "Label 537"
        sys4.app55.part78 -> sys4.app55.part81 "Label 565"

        # note 20
        sys5.app59 -> sys5.app71 "Label 566"
        sys5.app75 -> sys5.app71 "Label 465"
        sys5.app75 -> sys5.app71 "Label 566"
        sys5.app62 -> sys5.app76 "Label 567"
        sys5.app60 -> sys5.app76 "Label 567"
        sys5.app61 -> sys5.app76 "Label 567"
        sys5.app65 -> sys5.app72 "Label 568" "Label 316"
        sys5.app66 -> sys5.app73 "Label 569" "Label 316"
        sys5.app69 -> sys5.app73 "Label 570"
        sys5.app74 -> sys5.app72 "Label 571"
        sys5.app67 -> sys5.app68 "Label 572"
        sys5.app68 -> sys3.app42 "Label 573"
        sys5.app68 -> sys12.app136 "Label 574"

        # note 21
        sys6.app77 -> sys6.app78 "Label 461"
        sys6.app77 -> sys6.app88 "Label 575"
        sys6.app79 -> sys6.app77 "Label 576"
        sys6.app79 -> sys5.app68 "Label 577"
        sys6.app78 -> sys6.app93 "Label 575"
        sys6.app81 -> sys6.app89 "Label 578"
        sys6.app81 -> sys7.app107 "Label 501"
        sys6.app82 -> actor1 "Label 579"

        # note 22
        sys7.app101 -> sys7.app107 "Label 580"
        sys7.app101 -> sys7.app106 "Label 581"
        sys7.app101 -> sys7.app108 "Label 582"
        sys7.app94 -> sys7.app109 "Label 575"
        sys7.app94 -> sys7.app106 "Label 583"
        sys7.app95 -> sys7.app108 "Label 575"
        sys7.app98 -> sys7.app95 "Label 584"
        sys7.app98 -> sys35 "Label 585"
        sys7.app103 -> sys7.app107 "Label 586"
        sys7.app103 -> sys7.app106 "Label 586"
        sys7.app103 -> sys7.app109 "Label 587"
        sys7.app103 -> sys7.app108 "Label 588"
        sys7.app109 -> sys7.app103 "Label 589"
        sys7.app105 -> sys7.app99 "Label 461"

        # note 23
        sys10.app124 -> sys5 "Label 590"
        sys10.app124 -> sys6 "Label 469"
        sys10.app128 -> sys18.app159 "Label 461"
        sys10.app128 -> sys28 "Label 591"
        sys12.app139 -> sys5.app13 "Label 592"
        sys12.app139.part100 -> sys12.app139.part101 "Label 593"
        sys12.app139.part100 -> sys12.app139.part101 "Label 594"
        sys9.app121 -> sys9.app117 "Label 461"
        sys13.app140 -> sys13.app141 "Label 595"
        sys15.app46 -> sys15.app149 "Label 596"
        sys19.app160 -> sys19.app161 "Label 597"
        sys19.app160 -> sys3.app48 "Label 532"
        sys19.app160 -> sys3.app49 "Label 598"
        sys19.app160 -> sys1.app2 "Label 599"
        sys51.app174 -> sys51.app176 "Label 475"
    }

    views {

        # note 24
        systemLandscape ref1 "Label 600" {
            include sys1 sys9 sys3 sys2 sys5 sys8 sys15 sys14 sys4
            include sys12 sys10 sys6 sys7 sys16 sys11
            include sys13 sys20 sys30 sys29 sys31
            include sys25 sys18 sys27 sys19 sys38
            autolayout lr
        }

        systemLandscape ref2 "Label 601" {
            include *
            autolayout lr
        }

        systemContext sys1 "Label 602" {
            include *
            autolayout lr
        }

        systemContext sys2 "Label 603" {
            include *
            autolayout lr
        }

        systemContext sys3 "Label 604" {
            include *
            autolayout lr
        }

        systemContext sys4 "Label 605" {
            include *
            autolayout lr
        }

        systemContext sys51 "Label 606" {
            include *
            autolayout lr
        }

        # note 25
        container sys1 "Label 607" "Label 12" {
            include *
            autolayout lr
        }
        container sys2 "Label 608" "Label 609" {
            include *
            autolayout lr
        }
        container sys3 "Label 610" "Label 611" {
            include *
            autolayout lr
        }
        container sys4 "Label 612" "Label 613" {
            include *
            autolayout lr
        }
        container sys5 "Label 614" "Label 615" {
            include *
            autolayout lr
        }
        container sys6 "Label 616" "Label 617" {
            include *
            autolayout lr
        }
        container sys7 "Label 618" "Label 619" {
            include *
            autolayout lr
        }
        container sys51 "Label 620" "Label 621" {
            include *
            autolayout lr
        }
        container sys10 "Label 622" "Label 623" {
            include *
            autolayout lr
        }
        container sys9 "Label 624" "Label 625" {
            include *
            autolayout lr
        }
        container sys8 "Label 626" "Label 627" {
            include *
            autolayout lr
        }
        container sys11 "Label 628" "Label 629" {
            include *
            autolayout lr
        }
        container sys12 "Label 630" "Label 631" {
            include *
            autolayout lr
        }
        container sys13 "Label 632" "Label 633" {
            include *
            autolayout lr
        }
        container sys14 "Label 634" "Label 635" {
            include *
            autolayout lr
        }
        container sys15 "Label 636" "Label 637" {
            include *
            autolayout lr
        }
        container sys16 "Label 638" "Label 639" {
            include *
            autolayout lr
        }
        container sys17 "Label 640" "Label 641" {
            include *
            autolayout lr
        }
        container sys18 "Label 642" "Label 643" {
            include *
            autolayout lr
        }
        container sys19 "Label 644" "Label 645" {
            include *
            autolayout lr
        }
        container sys52 "Label 646" "Label 647" {
            include *
            autolayout lr
        }

        # note 26
        component sys4.app55 "Label 648" "Label 649" {
            include *
            autolayout lr
        }
        component sys4.app56 "Label 650" "Label 651" {
            include *
            autolayout lr
        }
        component sys4.app57 "Label 652" "Label 653" {
            include *
            autolayout lr
        }
        component sys3.app49 "Label 654" "Label 655" {
            include *
            autolayout lr
        }
        component sys3.app48 "Label 656" "Label 657" {
            include *
            autolayout lr
        }
        component sys3.app50 "Label 658" "Label 659" {
            include *
            autolayout lr
        }
        component sys2.app39 "Label 660" "Label 661" {
            include *
            autolayout lr
        }
        component sys2.app40 "Label 662" "Label 663" {
            include *
            autolayout lr
        }
        component sys2.app41 "Label 664" "Label 665" {
            include *
            autolayout lr
        }
        component sys12.app139 "Label 666" "Label 667" {
            include *
            autolayout lr
        }
        component sys11.app135 "Label 668" "Label 669" {
            include *
            autolayout lr
        }
        component sys5.app75 "Label 670" "Label 671" {
            include *
            autolayout lr
        }
        component sys5.app76 "Label 672" "Label 673" {
            include *
            autolayout lr
        }
        component sys6.app93 "Label 674" "Label 675" {
            include *
            autolayout lr
        }
        component sys51.app196 "Label 676" "Label 677" {
            include *
            autolayout lr
        }
        component sys51.app195 "Label 678" "Label 679" {
            include *
            autolayout lr
        }

        # note 27
        # note 28
        # note 29
        dynamic sys3 "Label 680" "Label 681" {
            sys2 -> sys3.app49 "Label 682,Label 683"
            sys2 -> sys3.app48 "Label 684"
            sys3.app48 -> sys3.app49 "Label 685"
            sys3.app49 -> sys3.app50 "Label 686"
            sys3.app49 -> sys1 "Label 687"
            autolayout lr
        }

        dynamic sys3 "Label 688" "Label 689" {
            sys3.app48 -> sys1 "Label 690"
            sys3.app48 -> sys3.app49 "Label 691"
            sys3.app49 -> sys3.app50 "Label 692"
            autolayout lr
        }

        dynamic sys6 "Label 693" "Label 694" {
            actor1 -> sys6.app82 "Label 695"
            sys6.app82 -> actor1 "Label 696"
            actor1 -> sys6.app82 "Label 697"
            sys6.app82 -> actor1 "Label 698"
            autolayout lr
        }

        styles {
            element "Element" {
                shape RoundedBox
                color #ffffff
            }
            element "Person" {
                shape Person
                background #0b4884
            }
            element "Software System" {
                background #1168bd
            }
            element "Container" {
                background #438dd5
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            element "Database" {
                shape Cylinder
            }
            element "Group" {
                background #6b6b6b
                shape Folder
            }
            element "Future" {
                opacity 55
                border dashed
            }
            element "Deprecated" {
                background #9b3232
                border dotted
            }
            relationship "Relationship" {
                thickness 2
            }
        }

        themes default
    }
}
