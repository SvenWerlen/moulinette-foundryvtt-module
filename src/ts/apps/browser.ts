import MouCollectionCloud, { CloudMode } from "../collections/collection-cloud";
import { MODULE_ID } from "../constants";
import { AnyDict } from "../types";
import MouApplication from "./application";
import { MouCollectionAssetTypeEnum, MouCollectionFilters, MouCollectionUtils } from "./collection";


export default class MouBrowser extends MouApplication {
  
  override APP_NAME = "MouBrowser"
  
  private html?: JQuery<HTMLElement>;
  private ignoreScroll: boolean = false;
  private page: number = 0; // -1 means = ignore. Otherwise, increments the page and loads more data
  private collection = new MouCollectionCloud(CloudMode.ALL)
  
  /* Filter preferences */
  private filters_prefs:AnyDict = {
    visible: true,
    opensections: { collection: true, asset_type: true, creator: false },
    collection: "cloud-all",
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
    this.page = 0
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
        collections: [{id: this.collection.getId(), name: this.collection.getName()}],
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

  async loadMoreAssets() {
    if(this.page < 0) return
    const assets = await this.collection.getAssets(this.filters, this.page)
    if(assets.length == 0) {
      this.page = -1
      this.logInfo("No more content!")
    } 
    else {
      this.page++
      const html = await renderTemplate(`modules/${MODULE_ID}/templates/browser-assets.hbs`, { assets })
      this.html?.find(".content").append(html)
    }
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
    this.filters.type = type ? (type as MouCollectionAssetTypeEnum) : MouCollectionAssetTypeEnum.Scene
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
}