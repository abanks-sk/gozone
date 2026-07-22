package com.gozone.food.model;

import jakarta.persistence.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "addon_groups")
public class AddonGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "menu_item_id", nullable = false)
    private MenuItem menuItem;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private boolean multi = false;

    @Column(nullable = false)
    private boolean required = false;

    @Column(nullable = false)
    private int position = 0;

    @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("position ASC")
    private List<AddonOption> options = new ArrayList<>();

    public UUID getId() { return id; }
    public MenuItem getMenuItem() { return menuItem; }
    public void setMenuItem(MenuItem menuItem) { this.menuItem = menuItem; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isMulti() { return multi; }
    public void setMulti(boolean multi) { this.multi = multi; }
    public boolean isRequired() { return required; }
    public void setRequired(boolean required) { this.required = required; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public List<AddonOption> getOptions() { return options; }
}
