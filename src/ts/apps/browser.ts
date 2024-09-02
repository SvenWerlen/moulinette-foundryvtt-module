import { MODULE_ID } from "../constants";
import { AnyDict, MouModule } from "../types";
import MouApplication from "./application";
import { MouCollection, MouCollectionAsset, MouCollectionAssetTypeEnum, MouCollectionFilters, MouCollectionUtils } from "./collection";


export default class MouBrowser extends MouApplication {
  
  override APP_NAME = "MouBrowser"
  
  private html?: JQuery<HTMLElement>;
  private ignoreScroll: boolean = false;
  private page: number = 0; // -1 means = ignore. Otherwise, increments the page and loads more data
  private collection?: MouCollection;
  private currentAssets = [] as MouCollectionAsset[];
  
  /* Filter preferences */
  private filters_prefs:AnyDict = {
    visible: true,
    opensections: { collection: true, asset_type: true, creator: true },
    collection: "cloud-accessible",
    focus: "search"
  }

  /* Filters */
  private filters: MouCollectionFilters = {
    type: MouCollectionAssetTypeEnum.Map,
    creator: "",
    pack: 0
  }

  override get title(): string {
    return (game as Game).i18n.localize("MOU.browser");
  }

  static override get defaultOptions(): ApplicationOptions {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "mou-browser",
      classes: ["mou"],
      template: `modules/${MODULE_ID}/templates/browser.hbs`,
      width: 1250,
      height: 1000,
      resizable: true
    }) as ApplicationOptions;
  }

  override async getData() {
    // check that module and collections are properly loaded
    const module = (game as Game).modules.get(MODULE_ID) as MouModule
    if(!module || !module.collections || module.collections.length == 0) 
      throw new Error(`${this.APP_NAME} | Module ${MODULE_ID} not found or no collection loaded`);
    // check that selected collection exists
    this.collection = module.collections.find( c => c.getId() == this.filters_prefs.collection)
    if(!this.collection) {
      throw new Error(`${this.APP_NAME} | Collection ${this.filters_prefs.collection} couldn't be found!`);
    }

    this.page = 0
    this.currentAssets = []
    const creators = this.filters.type ? await this.collection.getCreators(this.filters.type) : null
    const packs = this.filters.creator && this.filters.type ? await this.collection.getPacks(this.filters.type, this.filters.creator) : null
    const types = await this.collection.getTypes(this.filters)
    const typesObj = Object.keys(types).map( k => ({ id: Number(k), name: MouCollectionUtils.getTranslatedType(Number(k)), assetsCount: types[Number(k)]}))

    // split types into 2 lists
    const middleIndex = Math.ceil(typesObj.length/2);
    const types1 = typesObj.slice(0, middleIndex);
    const types2 = typesObj.slice(middleIndex);
    

    return {
      filters: {
        collections: module.collections.map( col => ( {id: col.getId(), name: col.getName() } )),
        prefs: this.filters_prefs,
        values: this.filters,
        creators,
        packs,
        types1,
        types2
      }
    };
  }

  override activateListeners(html: JQuery<HTMLElement>): void {
    super.activateListeners(html);
    this.html = html
    html.find(".filters h2")
      .on("click", this._onClickFilterSection.bind(this));
    html.find(".filters .clear a")
      .on("click", this._onClearFilters.bind(this));
    html.find(".filters-toggle")
      .on("click", this._onClickFiltersToggle.bind(this));
    html.find(".filters input")
      .on("click", this._onClickFilters.bind(this));
    html.find(".filters select")
      .on("change", this._onSelectFilters.bind(this));
    html.find(".content")
      .on('scroll', this._onScroll.bind(this))

    switch(this.filters_prefs.focus) {
      case "search": this.html.find(".searchbar input").trigger("focus"); break
      case "creator": this.html.find("#creator-select").trigger("focus"); break
      case "pack": this.html.find("#pack-select").trigger("focus"); break
      default:
    }

    this.loadMoreAssets()
  }

  /** Load more assets and activate events */
  async loadMoreAssets() {
    if(this.page < 0 || !this.collection) return
    const assets = await this.collection.getAssets(this.filters, this.page)
    if(assets.length == 0) {
      this.page = -1
      this.logInfo("No more content!")
    } 
    else {
      this.page++
      const html = await renderTemplate(`modules/${MODULE_ID}/templates/browser-assets.hbs`, { assets })
      this.html?.find(".content").append(html)
      Array.prototype.push.apply(this.currentAssets, assets);
    }
    // activate listeners
    this.html?.find(".asset").off()
    this.html?.find(".asset .preview").on("click", this._onShowMenu.bind(this));
    this.html?.find(".asset .menu").on("click", this._onHideMenu.bind(this));
    this.html?.find(".asset").on("mouseleave", this._onHideMenu.bind(this));
    this.html?.find(".asset a.creator").on("click", this._onClickAssetCreator.bind(this));
    this.html?.find(".asset a.pack").on("click", this._onClickAssetPack.bind(this));
  }

  /** Extend/collapse filter section */
  async _onClickFilterSection(event: Event): Promise<void> {
    event.preventDefault();
    if(event.currentTarget) {
      const section = $(event.currentTarget)
      const id = section.data("id")
      if(id) {
        const filter = this.html?.find(`div[data-id='${id}']`)
        const icon = section.find('i')
        if(filter && icon) {
          filter.toggleClass("collapsed")
          icon.attr('class', icon.hasClass("fa-square-minus") ? "fa-regular fa-square-plus" : "fa-regular fa-square-minus")
          this.filters_prefs.opensections[id] = icon.hasClass("fa-square-minus")
        }
      }
    }
  }

  /** Drop-down list selection (creator/packs) */
  async _onSelectFilters(event: Event): Promise<void> {
    event.preventDefault();
    if(event.currentTarget) {
      const combo = $(event.currentTarget)
      if(combo.attr('id') == "creator-select") {
        this.filters.creator = String(combo.val());
        this.filters.pack = 0
        this.filters_prefs.focus = "creator"
      } else if(combo.attr('id') == "pack-select") {
        this.filters.pack = Number(combo.val());
        this.filters_prefs.focus = "pack"
      }
      
      this.render()
    }
  }

  /** Show/hide filters */
  async _onClickFiltersToggle(event: Event): Promise<void> {
    event.preventDefault();
    if(event.currentTarget) {
      const toggle = $(event.currentTarget)
      const filters = this.html?.find(`.filters`)
      if(filters) {
        filters.toggleClass("collapsed")
        toggle.toggleClass("collapsed")
        toggle.find("i")?.attr('class', filters.is(":visible") ? "fa-solid fa-angles-left" : "fa-solid fa-angles-right")
        this.filters_prefs.visible = filters.is(":visible")
      }
    }
  }

  /** Filter interactions */
  async _onClickFilters(): Promise<void> {
    this.filters_prefs.collection = this.html?.find('.filters input[name=collection]:checked').attr('id')
    const type = Number(this.html?.find('.filters input[name=asset_type]:checked').attr('id'))
    this.filters.type = type ? (type as MouCollectionAssetTypeEnum) : MouCollectionAssetTypeEnum.Map
    this.render()
  }

  /** Load more assets when reaching the end of the page */
  async _onScroll(event: Event) {
    if(this.ignoreScroll || this.page < 0) return;
    if(event.currentTarget) {
      const target = $(event.currentTarget)
      const scrollHeight = target.prop("scrollHeight")
      const scrollTop = target.scrollTop()
      const clientHeight = target.innerHeight()
      if(scrollHeight && scrollTop && clientHeight && (scrollTop + clientHeight >= scrollHeight - 20)) {
        this.ignoreScroll = true 
        await this.loadMoreAssets()
        this.ignoreScroll = false
      }
    }
  }

  /** Mouse over an item : render menu */
  _onShowMenu(event: Event) {
    if(event.currentTarget) {
      const target = $(event.currentTarget)
      const asset = target.closest(".asset")
      const selAsset = this.currentAssets.find((a) => a.id == asset.data("id"))
      if(selAsset) {
        const actions = this.collection?.getActions(selAsset)
        if(actions && actions.length > 0) {
          asset.find(".menu").show(); 
          asset.find(".overlay").show();       
          renderTemplate(`modules/${MODULE_ID}/templates/browser-assets-actions.hbs`, { actions }).then( (html) => {
            asset.find(".menu").html(html)
            asset.find(".menu button").on("click", this._onAction.bind(this))
            asset.find(".menu button").on("mouseenter", this._onActionShowHint.bind(this))
            asset.find(".menu button").on("mouseleave", this._onActionHideHint.bind(this))
          })
        } else {
          this.logWarn(`No action for asset ${selAsset.name} (${selAsset.id})`)
        }
      } 
      else {
        this.logError(`Asset '${asset.data("id")}' not found. This must be a bug in Moulinette.`)
      }
      
    }
  }

  /** Mouse out an item : hide menu */
  _onHideMenu(event: Event) {
    if(event.currentTarget) {
      const target = $(event.currentTarget)
      const asset = target.closest(".asset")
      asset.find(".menu").html("")
      asset.find(".menu").hide(); 
      asset.find(".overlay").hide();
    }
  }

  /** User clicked on menu item */
  _onAction(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if(event.currentTarget) {
      const target = $(event.currentTarget)
      const actionId = target.data("id")
      const assetId = target.closest(".asset").data("id")
      this.collection?.executeAction(actionId, assetId)
    }
  }

  /** User clicked on asset creator */
  _onClickAssetCreator(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if(event.currentTarget) {
      const target = $(event.currentTarget)
      const creator = target.closest(".source").data("creator")
      if(creator) {
        this.filters.creator = creator
        this.filters.pack = 0
        this.render()
      }
    }
  }

  _onClickAssetPack(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if(event.currentTarget) {
      const target = $(event.currentTarget)
      const creator = target.closest(".source").data("creator")
      const pack = target.closest(".source").data("pack")
      if(creator && pack) {
        this.filters.creator = creator
        this.filters.pack = Number(pack)
        this.render()
      }
    }
  }

  _onClearFilters(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.filters.creator = ""
    this.filters.pack = 0
    this.filters.type = MouCollectionAssetTypeEnum.Map
    this.render()
  }

  _onActionShowHint(event: Event) {
    event.preventDefault();
    if(event.currentTarget) {
      // Show hint (to the right if enough space, otherwise to the left)
      const button = $(event.currentTarget)     // asset's button
      const asset = button.closest(".asset")    // asset inside the content
      const content = asset.closest(".content") // entire content
      const buttonPos = button.position()
      const assetPos = asset.position()
      const assetWidth = asset.outerWidth()
      const contentWidth = content.outerWidth(true)
      const contentScrollY = content.scrollTop()
      if(assetPos !== undefined && assetWidth !== undefined && contentWidth !== undefined && buttonPos !== undefined && contentScrollY !== undefined) {
        const remainingSpace = contentWidth - (assetPos.left + assetWidth)
        if(remainingSpace > 220) {
          content.find(".actionhint").css({ top: assetPos.top + buttonPos.top + contentScrollY, left: assetPos.left + assetWidth, 'visibility': 'visible', 'opacity': 1})
        } else {
          content.find(".actionhint").css({ top: assetPos.top + buttonPos.top + contentScrollY, left: assetPos.left - 200 + 16, 'visibility': 'visible', 'opacity': 1})
        }
      }
    }
    
    //.css({ top: div.offset().top, left: div.offset().left + div.width() + 20, 'visibility': 'visible', 'opacity': 1})
  }

  _onActionHideHint(event: Event) {
    event.preventDefault();
    this.html?.find(".actionhint").css({'visibility': 'hidden', 'opacity': 0})
  }
}